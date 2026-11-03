// ---
// relationships:
//   implements: library
// ---
/**
 * T3Client: the composition root. It wires the HTTP transport, the auth
 * client, the socket transport (ticket or bearer-header upgrade), the RPC
 * connection and typed client, and every facade. The socket opens lazily on
 * the first RPC use and reconnects when the stored credential changes;
 * `close()` stops reconnecting and ends every stream.
 */
import { GuestSharesApi } from "./api/guestShares.ts";
import { PeerLinksApi } from "./api/peerLinks.ts";
import { ProjectsApi } from "./api/projects.ts";
import { ScheduledTasksApi } from "./api/scheduledTasks.ts";
import { ServerApi } from "./api/server.ts";
import { ShellApi } from "./api/shell.ts";
import { TerminalApi } from "./api/terminal.ts";
import { ThreadsApi } from "./api/threads.ts";
import { VcsApi } from "./api/vcs.ts";
import { CommandDispatcher } from "./api/dispatch.ts";
import { AuthClient } from "./auth/authClient.ts";
import { createDpopProof } from "./auth/dpop.ts";
import { ensureScopes } from "./auth/scopes.ts";
import { memoryCredentialStore, type CredentialStore } from "./auth/credentialStore.ts";
import { T3AuthError, T3PreconditionError } from "./errors.ts";
import { HttpRouteClient } from "./http/client.ts";
import { httpRoutes, type HttpRoutes } from "./http/registry.ts";
import type { BackoffPolicy } from "./internal/backoff.ts";
import type { Logger } from "./internal/logger.ts";
import { defaultWebSocket, type WebSocketConstructor } from "./internal/websocket.ts";
import { RpcClient } from "./rpc/client.ts";
import { rpcMethods, type RpcMethods } from "./rpc/registry.ts";
import {
  ORCHESTRATION_PROTOCOL_QUERY_PARAM,
  ORCHESTRATION_PROTOCOL_VERSION_TEXT,
} from "./schemas/environment.ts";
import { PreviewViewerTarget } from "./schemas/previewViewer.ts";
import { HttpTransport } from "./transport/http.ts";
import { connectPreviewViewer, type PreviewViewer } from "./transport/previewViewer.ts";
import { RpcConnection } from "./transport/rpcConnection.ts";
import { SocketTransport } from "./transport/socket.ts";

export interface T3ClientOptions {
  readonly baseUrl: string;
  /** Defaults to an in-memory store. */
  readonly credentials?: CredentialStore;
  /** Convenience: seeds a fresh in-memory store. Not combined with `credentials`. */
  readonly accessToken?: string;
  readonly clientLabel?: string;
  /** Sent as `clientAppVersion` on the socket upgrade. */
  readonly clientAppVersion?: string;
  readonly fetch?: typeof fetch;
  /** `fetch` carries the session itself, as a cookie jar for a browser session does. */
  readonly fetchAuthenticates?: boolean;
  readonly webSocket?: WebSocketConstructor;
  readonly logger?: Logger;
  /** Reconnect delays; defaults to 500 ms × 1.5, capped at 5 s, with jitter 0.2. */
  readonly backoff?: BackoffPolicy;
  /** Defaults to 5,000 ms. */
  readonly pingIntervalMs?: number;
  /** Defaults to 3 missed pongs. */
  readonly missedPongLimit?: number;
  /** Bounds the WebSocket handshake; absent means no open timeout. */
  readonly openTimeoutMs?: number;
  /** "ticket" (default) works with every WebSocket implementation. */
  readonly socketAuth?: "ticket" | "bearer-header";
}

/** Client composition root for HTTP, auth, RPC and server facades. */
export class T3Client {
  readonly auth: AuthClient;
  readonly server: ServerApi;
  readonly projects: ProjectsApi;
  readonly threads: ThreadsApi;
  readonly shell: ShellApi;
  readonly vcs: VcsApi;
  readonly terminal: TerminalApi;
  readonly scheduledTasks: ScheduledTasksApi;
  readonly peerLinks: PeerLinksApi;
  readonly guestShares: GuestSharesApi;
  readonly rpc: RpcClient<RpcMethods>;
  readonly routes: HttpRouteClient<HttpRoutes>;
  readonly #socket: SocketTransport;
  readonly #connection: RpcConnection;
  readonly #baseUrl: string;
  readonly #webSocket: WebSocketConstructor | undefined;

  private constructor(options: T3ClientOptions) {
    if (options.credentials && options.accessToken !== undefined) {
      throw new T3PreconditionError("Pass either credentials or accessToken, not both.");
    }
    this.#baseUrl = options.baseUrl;
    this.#webSocket = options.webSocket;
    const credentials =
      options.credentials ??
      memoryCredentialStore(
        options.accessToken === undefined ? {} : { accessToken: options.accessToken },
      );
    const http = new HttpTransport({
      baseUrl: options.baseUrl,
      getAccessToken: () => this.auth.currentAccessToken(),
      getDpopKey: () => this.auth.currentDpopKey(),
      userAgent: userAgent(options),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.fetchAuthenticates === undefined
        ? {}
        : { fetchAuthenticates: options.fetchAuthenticates }),
    });
    this.auth = new AuthClient(http, credentials);
    this.routes = new HttpRouteClient(http, httpRoutes, {
      getScopes: () => this.auth.scopesSync(),
    });

    const socketAuth = options.socketAuth ?? "ticket";
    this.#socket = new SocketTransport({
      // Every attempt loads the credential, which also primes `auth.scopesSync()`.
      url: async () => {
        const url = socketUrl(options);
        if (socketAuth === "ticket") {
          // Only a ticket minted for the RPC use is bound to the key; a bare ticket is not.
          const key = await this.auth.currentDpopKey();
          const { ticket } =
            key === undefined
              ? await this.auth.websocketTicket()
              : await this.routes.call("auth.webSocketTicketFor", { params: { use: "rpc" } });
          url.searchParams.set("wsTicket", ticket);
          // A socket cannot set headers, so the proof rides in the query.
          if (key !== undefined) {
            const proof = createDpopProof({ key, method: "GET", url, accessToken: ticket });
            url.searchParams.set("dpop", proof);
          }
        }
        return url;
      },
      ...(socketAuth === "bearer-header"
        ? { headers: () => this.#bearerHeaders(socketUrl(options)) }
        : {}),
      ...(options.backoff === undefined ? {} : { backoff: options.backoff }),
      ...(options.pingIntervalMs === undefined ? {} : { pingIntervalMs: options.pingIntervalMs }),
      ...(options.missedPongLimit === undefined
        ? {}
        : { missedPongLimit: options.missedPongLimit }),
      ...(options.openTimeoutMs === undefined ? {} : { openTimeoutMs: options.openTimeoutMs }),
      ...(options.webSocket === undefined ? {} : { webSocket: options.webSocket }),
      ...(options.logger === undefined ? {} : { logger: options.logger }),
    });
    this.auth.onCredentialsChange(() => this.#socket.reconnect());
    this.#connection = new RpcConnection(
      this.#socket,
      options.logger === undefined ? {} : { logger: options.logger },
    );
    this.rpc = new RpcClient(this.#connection, rpcMethods, {
      getScopes: () => this.auth.scopesSync(),
      ...(options.logger === undefined ? {} : { logger: options.logger }),
    });

    const dispatcher = new CommandDispatcher(this.rpc);
    this.server = new ServerApi(this.rpc, http);
    this.projects = new ProjectsApi(http, this.rpc, dispatcher);
    this.threads = new ThreadsApi(http, this.rpc, dispatcher);
    this.shell = new ShellApi(http, this.rpc);
    this.vcs = new VcsApi(this.rpc);
    this.terminal = new TerminalApi(this.rpc);
    this.peerLinks = new PeerLinksApi(this.rpc);
    this.guestShares = new GuestSharesApi(this.rpc, dispatcher);
    this.scheduledTasks = new ScheduledTasksApi(this.rpc, {
      baseUrl: options.baseUrl,
      getScopes: () => this.auth.scopesSync(),
    });
  }

  /** Compose a client with lazy connections and the selected credential store. */
  static create(options: T3ClientOptions): T3Client {
    return new T3Client(options);
  }

  /**
   * Attach to a tab that runs in the server's browser, with a new ticket for the
   * `media` use. Each viewer is its own socket, and `close()` of this client does not
   * end it.
   */
  async openPreviewViewer(
    target: PreviewViewerTarget,
    signal?: AbortSignal,
  ): Promise<PreviewViewer> {
    const parsed = PreviewViewerTarget.safeParse(target);
    if (!parsed.success) {
      throw new T3PreconditionError(`Preview viewer target is invalid: ${parsed.error.message}`);
    }
    const granted = await this.auth.currentScopes();
    if (granted !== undefined) ensureScopes(granted, ["orchestration:read"], "openPreviewViewer");
    const { ticket } = await this.routes.call(
      "auth.webSocketTicketFor",
      { params: { use: "media" } },
      signal,
    );
    const url = previewViewerUrl(this.#baseUrl, parsed.data);
    url.searchParams.set("wsTicket", ticket);
    const key = await this.auth.currentDpopKey();
    if (key !== undefined) {
      url.searchParams.set(
        "dpop",
        createDpopProof({ key, method: "GET", url, accessToken: ticket }),
      );
    }
    return connectPreviewViewer(this.#webSocket ?? (await defaultWebSocket()), url, signal);
  }

  /** Optional eager connect; every RPC connects on demand otherwise. */
  connect(signal?: AbortSignal): Promise<void> {
    return this.#socket.connect(signal);
  }

  /** Stops reconnecting, fails everything in flight, and closes the socket. */
  close(): Promise<void> {
    return this.#connection.close();
  }

  /**
   * Bearer-header upgrade headers. A WebSocket implementation without upgrade
   * status reporting (the global one) shows a 401 upgrade as an ordinary drop,
   * which would retry forever; validating the token over HTTP first turns a
   * dead credential into a fatal `open_failed` instead.
   */
  async #bearerHeaders(url: URL): Promise<Record<string, string>> {
    const token = await this.auth.currentAccessToken();
    if (token === undefined) {
      throw socketAuthError("missing_credential", "The socket upgrade needs an access token.");
    }
    const state = await this.auth.sessionState();
    if (!state.authenticated) {
      throw socketAuthError("invalid_credential", "The access token does not authenticate.");
    }
    const key = await this.auth.currentDpopKey();
    if (key === undefined) return { authorization: `Bearer ${token}` };
    return {
      authorization: `DPoP ${token}`,
      dpop: createDpopProof({ key, method: "GET", url, accessToken: token }),
    };
  }
}

function socketAuthError(reason: string, message: string): T3AuthError {
  return new T3AuthError(message, {
    code: "auth_invalid",
    status: 401,
    method: "GET",
    path: "/ws",
    body: undefined,
    reason,
  });
}

function webSocketUrl(path: string, baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(path, baseUrl);
  } catch (cause) {
    throw new T3PreconditionError(`baseUrl is not a valid URL: ${baseUrl}`, { cause });
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

function previewViewerUrl(baseUrl: string, target: PreviewViewerTarget): URL {
  const url = webSocketUrl("/api/preview-stream/ws", baseUrl);
  for (const [name, value] of Object.entries(target)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  return url;
}

function socketUrl(options: T3ClientOptions): URL {
  const url = webSocketUrl("/ws", options.baseUrl);
  // The server answers 426 to an upgrade that does not name the protocol it speaks.
  url.searchParams.set(ORCHESTRATION_PROTOCOL_QUERY_PARAM, ORCHESTRATION_PROTOCOL_VERSION_TEXT);
  url.searchParams.set("clientSurface", "cli");
  if (options.clientAppVersion !== undefined) {
    url.searchParams.set("clientAppVersion", options.clientAppVersion);
  }
  return url;
}

function userAgent(options: T3ClientOptions): string {
  const version = options.clientAppVersion === undefined ? "" : `/${options.clientAppVersion}`;
  const label = options.clientLabel === undefined ? "" : ` (${options.clientLabel})`;
  return `t3code-client${version}${label}`;
}
