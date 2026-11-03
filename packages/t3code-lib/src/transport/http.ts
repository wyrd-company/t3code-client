import type { z } from "zod";

import {
  T3AuthError,
  T3ConnectionError,
  T3DecodeError,
  T3Error,
  T3PreconditionError,
} from "../errors.ts";
import { createDpopProof } from "../auth/dpop.ts";
import type { DpopPrivateJwk } from "../schemas/auth.ts";
import { httpError, parseBody } from "./httpAnswer.ts";

export interface HttpTransportOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  getAccessToken: () => Promise<string | undefined>;
  /** The key of a proof-bound session; its requests carry `Authorization: DPoP` and a proof. */
  getDpopKey?: () => Promise<DpopPrivateJwk | undefined>;
  /** The `fetch` carries the session itself, as a cookie jar does; no token is required. */
  fetchAuthenticates?: boolean;
  userAgent?: string;
}

export interface HttpRequest<T> {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown | URLSearchParams;
  auth?: "required" | "optional" | "none";
  /** Extra request headers, for example the orchestration protocol version. */
  headers?: Record<string, string>;
  decode: z.ZodType<T> | "empty";
  signal?: AbortSignal;
  /** Signs this request with this key instead of the session's key, as a token exchange does. */
  dpopKey?: DpopPrivateJwk;
  /** A 2xx answer reaches `decode` as `{ bytes, contentType }`, not parsed as JSON. */
  binaryResponse?: boolean;
  /** A 3xx answer is not followed, and reaches `decode` as `{ location }`. */
  redirectResponse?: boolean;
  /** Errors name this and not `path`, when `path` or `query` is a credential. */
  errorPath?: string;
}

export class HttpTransport {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #getAccessToken: () => Promise<string | undefined>;
  readonly #getDpopKey: (() => Promise<DpopPrivateJwk | undefined>) | undefined;
  readonly #fetchAuthenticates: boolean;
  readonly #userAgent: string | undefined;

  constructor(options: HttpTransportOptions) {
    this.#baseUrl = options.baseUrl;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#getAccessToken = options.getAccessToken;
    this.#getDpopKey = options.getDpopKey;
    this.#fetchAuthenticates = options.fetchAuthenticates ?? false;
    this.#userAgent = options.userAgent;
  }

  request<T>(request: HttpRequest<T>): Promise<T> {
    return this.#request(request, undefined, false);
  }

  /** Auth control-plane hook for validating a candidate token before it is stored. */
  requestWithAccessToken<T>(
    request: HttpRequest<T>,
    accessToken: string,
    dpopKey?: DpopPrivateJwk,
  ): Promise<T> {
    return this.#request(
      { ...request, ...(dpopKey === undefined ? {} : { dpopKey }) },
      accessToken,
      true,
    );
  }

  /**
   * Sends the request and returns a 2xx response with its body unread, for an answer that arrives
   * over time. `decode` is not used.
   */
  async openResponse(request: HttpRequest<unknown>): Promise<Response> {
    const errorPath = request.errorPath ?? request.path;
    const response = await this.#send(request, undefined, false);
    if (response.ok) return response;
    const raw = await readAnswer(request, response, errorPath);
    throw httpError(response.status, request.method, errorPath, raw);
  }

  async #request<T>(
    request: HttpRequest<T>,
    accessTokenOverride: string | undefined,
    hasOverride: boolean,
  ): Promise<T> {
    const errorPath = request.errorPath ?? request.path;
    const response = await this.#send(request, accessTokenOverride, hasOverride);
    if (request.redirectResponse === true && response.type === "opaqueredirect") {
      throw new T3PreconditionError(
        `${request.method} ${errorPath} answers with a redirect that this fetch hides.`,
      );
    }
    const raw = await readAnswer(request, response, errorPath);
    if (!response.ok && !isReadableRedirect(request, response)) {
      throw httpError(response.status, request.method, errorPath, raw);
    }
    if (request.decode === "empty") return undefined as T;

    const decoded = request.decode.safeParse(raw);
    if (!decoded.success) {
      throw new T3DecodeError(`${request.method} ${errorPath}`, decoded.error, raw);
    }
    return decoded.data;
  }

  async #send(
    request: HttpRequest<unknown>,
    accessTokenOverride: string | undefined,
    hasOverride: boolean,
  ): Promise<Response> {
    const errorPath = request.errorPath ?? request.path;
    const url = requestUrl(request, this.#baseUrl, errorPath);
    const credential = hasOverride
      ? { accessToken: accessTokenOverride, dpopKey: request.dpopKey }
      : await this.#sessionCredential(request);
    this.#requireCredential(request, credential.accessToken, errorPath);
    const headers = this.#requestHeaders(request, url, credential);
    const body = encodeBody(request, headers, errorPath);

    try {
      return await this.#fetch(url, {
        method: request.method,
        headers,
        ...(body === undefined ? {} : { body }),
        ...(request.redirectResponse === true ? { redirect: "manual" as const } : {}),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
    } catch (cause) {
      throw new T3ConnectionError(
        "open_failed",
        `${request.method} ${errorPath} could not reach the server.`,
        keptCause(request, cause),
      );
    }
  }

  /** The stored token and key. A request with `auth: "none"` loads neither. */
  async #sessionCredential(request: HttpRequest<unknown>): Promise<RequestCredential> {
    if ((request.auth ?? "none") === "none") {
      return { accessToken: undefined, dpopKey: request.dpopKey };
    }
    try {
      const accessToken = await this.#getAccessToken();
      const dpopKey =
        request.dpopKey ?? (accessToken === undefined ? undefined : await this.#getDpopKey?.());
      return { accessToken, dpopKey };
    } catch (cause) {
      if (cause instanceof T3Error) throw cause;
      throw new T3ConnectionError("open_failed", "Could not load the HTTP credential.", {
        cause,
      });
    }
  }

  #requireCredential(
    request: HttpRequest<unknown>,
    accessToken: string | undefined,
    errorPath: string,
  ): void {
    if (request.auth !== "required" || accessToken !== undefined || this.#fetchAuthenticates) {
      return;
    }
    throw new T3AuthError("This request requires an access token.", {
      code: "auth_invalid",
      status: 401,
      method: "LOCAL",
      path: errorPath,
      body: undefined,
      reason: "missing_credential",
    });
  }

  #requestHeaders(
    request: HttpRequest<unknown>,
    url: URL,
    { accessToken, dpopKey }: RequestCredential,
  ): Headers {
    const headers = checkedHeaders(request.headers, errorPathOf(request));
    const sentToken = (request.auth ?? "none") === "none" ? undefined : accessToken;
    if (sentToken !== undefined) {
      headers.set("authorization", `${dpopKey === undefined ? "Bearer" : "DPoP"} ${sentToken}`);
    }
    if (dpopKey !== undefined) {
      headers.set(
        "dpop",
        createDpopProof({
          key: dpopKey,
          method: request.method,
          url,
          ...(sentToken === undefined ? {} : { accessToken: sentToken }),
        }),
      );
    }
    if (this.#userAgent !== undefined) headers.set("user-agent", this.#userAgent);
    return headers;
  }
}

function errorPathOf(request: HttpRequest<unknown>): string {
  return request.errorPath ?? request.path;
}

/** A native failure quotes the value, which can be a signature, so this error keeps no cause. */
function checkedHeaders(values: Record<string, string> | undefined, errorPath: string): Headers {
  try {
    return new Headers(values);
  } catch {
    throw new T3PreconditionError(`${errorPath} has a request header that is not valid.`);
  }
}

interface RequestCredential {
  readonly accessToken: string | undefined;
  readonly dpopKey: DpopPrivateJwk | undefined;
}

/** A URL or fetch failure can quote the URL, so a signed path's error keeps no cause. */
function keptCause(request: HttpRequest<unknown>, cause: unknown): { cause?: unknown } {
  return request.errorPath === undefined ? { cause } : {};
}

function requestUrl(request: HttpRequest<unknown>, baseUrl: string, errorPath: string): URL {
  let url: URL;
  try {
    url = new URL(request.path, baseUrl);
  } catch (cause) {
    throw new T3PreconditionError(`Invalid HTTP URL for ${errorPath}.`, keptCause(request, cause));
  }
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

/** The body to send; sets the `content-type` header that names its encoding. */
function encodeBody(
  request: HttpRequest<unknown>,
  headers: Headers,
  errorPath: string,
): BodyInit | undefined {
  if (request.body === undefined) return undefined;
  if (request.body instanceof URLSearchParams) {
    headers.set("content-type", "application/x-www-form-urlencoded");
    return request.body;
  }
  // `fetch` writes the content type of a multipart body, with its boundary.
  if (request.body instanceof FormData) return request.body;
  if (request.body instanceof Uint8Array) {
    if (!headers.has("content-type")) headers.set("content-type", "application/octet-stream");
    return request.body as Uint8Array<ArrayBuffer>;
  }
  headers.set("content-type", "application/json");
  try {
    return JSON.stringify(request.body);
  } catch (cause) {
    throw new T3PreconditionError(
      `${request.method} ${errorPath} could not encode its JSON body.`,
      { cause },
    );
  }
}

async function readAnswer(
  request: HttpRequest<unknown>,
  response: Response,
  errorPath: string,
): Promise<unknown> {
  if (isReadableRedirect(request, response)) return redirectBody(response);
  try {
    return response.ok && request.binaryResponse === true
      ? binaryBody(new Uint8Array(await response.arrayBuffer()), response)
      : parseBody(await response.text());
  } catch (cause) {
    throw new T3ConnectionError(
      "open_failed",
      `${request.method} ${errorPath} could not read the server response.`,
      keptCause(request, cause),
    );
  }
}

function isReadableRedirect(request: HttpRequest<unknown>, response: Response): boolean {
  return request.redirectResponse === true && response.status >= 300 && response.status < 400;
}

function redirectBody(response: Response): unknown {
  const location = response.headers.get("location");
  return location === null ? {} : { location };
}

function binaryBody(bytes: Uint8Array, response: Response): unknown {
  const contentType = response.headers.get("content-type");
  return contentType === null ? { bytes } : { bytes, contentType };
}
