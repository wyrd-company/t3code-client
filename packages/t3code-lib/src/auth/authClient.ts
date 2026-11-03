// ---
// relationships:
//   implements: library
// ---
/**
 * AuthClient: the auth control plane over HTTP, and the only module that
 * reads or writes the credential store. It keeps an in-memory copy of the
 * last credentials it loaded or saved so the RPC layer can check scopes
 * without a store round trip, and it tells subscribers when the stored
 * credential changes so an open socket can re-authenticate.
 */
import { T3AuthError, T3PreconditionError } from "../errors.ts";
import { callRoute, routeRequest } from "../http/client.ts";
import { httpRoutes } from "../http/registry.ts";
import type { Clock } from "../internal/clock.ts";
import { systemClock } from "../internal/clock.ts";
import {
  grantedScopes,
  type AuthAccessTokenResult as AuthAccessTokenResultType,
  type AuthClientMetadataDeviceType as AuthClientMetadataDeviceTypeType,
  type AuthCreatePairingCredentialInput as AuthCreatePairingCredentialInputType,
  type AuthEnvironmentScope as AuthEnvironmentScopeType,
  type AuthGrantedScope as AuthGrantedScopeType,
  type AuthPairingCredentialResult as AuthPairingCredentialResultType,
  type AuthSessionState as AuthSessionStateType,
  type AuthWebSocketTicketResult as AuthWebSocketTicketResultType,
  type DpopPrivateJwk,
} from "../schemas/auth.ts";
import type { AuthSessionId } from "../schemas/common.ts";
import type { ExecutionEnvironmentDescriptor as ExecutionEnvironmentDescriptorType } from "../schemas/environment.ts";
import type { HttpTransport } from "../transport/http.ts";
import type { CredentialStore, StoredCredentials } from "./credentialStore.ts";
import { ensureScopes as requireScopes, hasScope as includesScope } from "./scopes.ts";

export interface ExchangePairingTokenOptions {
  scopes?: AuthEnvironmentScopeType[];
  clientLabel?: string;
  clientDeviceType?: AuthClientMetadataDeviceTypeType;
  clientOs?: string;
  /** Binds the session to this key, so that a stolen token is useless without it. */
  dpopKey?: DpopPrivateJwk;
}

export interface SetAccessTokenOptions {
  /** The key the token is bound to, when the session is proof-bound. */
  dpopKey?: DpopPrivateJwk;
}

/** Auth control plane and the sole owner of credential-store access. */
export class AuthClient {
  #cached: StoredCredentials | undefined;
  #version = 0;
  readonly #changeHandlers = new Set<() => void>();

  readonly http: HttpTransport;
  readonly credentials: CredentialStore;
  readonly clock: Clock;

  constructor(http: HttpTransport, credentials: CredentialStore, clock: Clock = systemClock) {
    this.http = http;
    this.credentials = credentials;
    this.clock = clock;
  }

  /** Increments every time this client saves or clears a different credential. */
  get credentialsVersion(): number {
    return this.#version;
  }

  /** Called after every change to the stored credential made through this client. */
  onCredentialsChange(handler: () => void): () => void {
    this.#changeHandlers.add(handler);
    return () => this.#changeHandlers.delete(handler);
  }

  /** Scopes of the last credential loaded or saved; `undefined` until one is known. */
  scopesSync(): AuthGrantedScopeType[] | undefined {
    const scopes = this.#cached?.scopes;
    return scopes === undefined ? undefined : [...scopes];
  }

  /** Read the public environment descriptor without authentication. */
  descriptor(signal?: AbortSignal): Promise<ExecutionEnvironmentDescriptorType> {
    return callRoute(this.http, httpRoutes["metadata.descriptor"], undefined, { signal });
  }

  /** Read the session state using the stored token when present. */
  sessionState(signal?: AbortSignal): Promise<AuthSessionStateType> {
    return callRoute(this.http, httpRoutes["auth.session"], undefined, { signal });
  }

  /**
   * Exchange a bootstrap credential and save the resulting session. A pairing
   * token is single use; a desktop bootstrap token can be exchanged again.
   */
  async exchangePairingToken(
    pairingToken: string,
    options: ExchangePairingTokenOptions = {},
  ): Promise<AuthAccessTokenResultType> {
    if (pairingToken.trim().length === 0) {
      throw new T3PreconditionError("pairingToken must not be empty.");
    }
    const result = await callRoute(
      this.http,
      httpRoutes["auth.token"],
      {
        body: {
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: pairingToken,
          subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
          requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
          ...(options.scopes === undefined ? {} : { scope: options.scopes.join(" ") }),
          ...(options.clientLabel === undefined ? {} : { client_label: options.clientLabel }),
          ...(options.clientDeviceType === undefined
            ? {}
            : { client_device_type: options.clientDeviceType }),
          ...(options.clientOs === undefined ? {} : { client_os: options.clientOs }),
        },
      },
      { dpopKey: options.dpopKey },
    );
    const bound = result.token_type === "DPoP";
    await this.#save({
      accessToken: result.access_token,
      scopes: splitScopes(result.scope),
      expiresAt: new Date(this.clock.now().getTime() + result.expires_in * 1_000).toISOString(),
      sessionMethod: bound ? "dpop-access-token" : "bearer-access-token",
      ...(bound && options.dpopKey !== undefined ? { dpopKey: options.dpopKey } : {}),
    });
    return result;
  }

  /** Validate an issued token before saving its session metadata. */
  async setAccessToken(
    token: string,
    options: SetAccessTokenOptions = {},
  ): Promise<AuthSessionStateType> {
    if (token.trim().length === 0) throw new T3PreconditionError("token must not be empty.");
    const state = await this.http.requestWithAccessToken(
      { ...routeRequest(httpRoutes["auth.session"], undefined), auth: "required" },
      token,
      options.dpopKey,
    );
    if (!state.authenticated) {
      throw new T3AuthError("The supplied access token did not authenticate a session.", {
        code: "auth_invalid",
        status: 401,
        method: "GET",
        path: "/api/auth/session",
        body: state,
        reason: "invalid_credential",
      });
    }
    await this.#save({
      ...credentialsFromState(token, state),
      ...(options.dpopKey === undefined ? {} : { dpopKey: options.dpopKey }),
    });
    return state;
  }

  /** Forgets the stored credential. */
  async clearCredentials(): Promise<void> {
    await this.credentials.clear();
    this.#remember({});
  }

  /** Issue a short-lived WebSocket ticket for the stored credential. */
  websocketTicket(signal?: AbortSignal): Promise<AuthWebSocketTicketResultType> {
    return callRoute(this.http, httpRoutes["auth.webSocketTicket"], undefined, { signal });
  }

  /** Create a pairing credential with the requested scopes. */
  createPairingCredential(
    input: AuthCreatePairingCredentialInputType,
  ): Promise<AuthPairingCredentialResultType> {
    return callRoute(this.http, httpRoutes["auth.pairingCredential"], { body: input });
  }

  /** Revoke a pairing link; return whether it was revoked. */
  async revokePairingLink(id: string): Promise<boolean> {
    const body = { id };
    return (await callRoute(this.http, httpRoutes["auth.revokePairingLink"], { body })).revoked;
  }

  /** Revoke the selected client session. */
  async revokeClient(sessionId: AuthSessionId): Promise<boolean> {
    const body = { sessionId };
    return (await callRoute(this.http, httpRoutes["auth.revokeClient"], { body })).revoked;
  }

  /** Revoke other sessions; return the number revoked. */
  async revokeOtherClients(): Promise<number> {
    return (await callRoute(this.http, httpRoutes["auth.revokeOtherClients"], undefined))
      .revokedCount;
  }

  /** Load the current bearer token through the credential store. */
  async currentAccessToken(): Promise<string | undefined> {
    return (await this.#load()).accessToken;
  }

  /** The key of a proof-bound session; `undefined` for a bearer session. */
  async currentDpopKey(): Promise<DpopPrivateJwk | undefined> {
    return (await this.#load()).dpopKey;
  }

  /** Load and return the scopes granted to the current credential. */
  async currentScopes(): Promise<AuthGrantedScopeType[] | undefined> {
    await this.#load();
    return this.scopesSync();
  }

  /** Check whether the credential grants the requested scope. */
  async hasScope(scope: AuthEnvironmentScopeType): Promise<boolean> {
    return includesScope(await this.currentScopes(), scope);
  }

  /** Throw T3AuthError when a required scope is missing. */
  async ensureScopes(required: AuthEnvironmentScopeType[]): Promise<void> {
    requireScopes(await this.currentScopes(), required, "authenticated operation");
  }

  async #load(): Promise<StoredCredentials> {
    const loaded = await this.credentials.load();
    this.#cached = loaded;
    return loaded;
  }

  async #save(next: StoredCredentials): Promise<void> {
    await this.credentials.save(next);
    this.#remember(next);
  }

  /** Records the credential this client now holds; a real change bumps the version. */
  #remember(next: StoredCredentials): void {
    const changed = this.#cached === undefined || !sameCredentials(this.#cached, next);
    this.#cached = next;
    if (!changed) return;
    this.#version += 1;
    for (const handler of this.#changeHandlers) handler();
  }
}

/** The token exchange reports scopes as one space-separated string. */
function splitScopes(value: string): AuthGrantedScopeType[] {
  return value.split(/\s+/u).filter(Boolean);
}

function sameCredentials(a: StoredCredentials, b: StoredCredentials): boolean {
  return (
    a.accessToken === b.accessToken &&
    a.expiresAt === b.expiresAt &&
    a.sessionMethod === b.sessionMethod &&
    a.dpopKey?.d === b.dpopKey?.d &&
    (a.scopes ?? []).join(" ") === (b.scopes ?? []).join(" ")
  );
}

function credentialsFromState(token: string, state: AuthSessionStateType): StoredCredentials {
  return {
    accessToken: token,
    ...(state.scopes === undefined && state.permissions === undefined
      ? {}
      : { scopes: grantedScopes(state) }),
    ...(state.expiresAt === undefined ? {} : { expiresAt: state.expiresAt }),
    ...(state.sessionMethod === undefined ? {} : { sessionMethod: state.sessionMethod }),
  };
}
