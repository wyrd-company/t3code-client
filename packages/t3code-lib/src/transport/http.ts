import type { z } from "zod";

import {
  T3AuthError,
  T3ConnectionError,
  T3DecodeError,
  T3Error,
  T3HttpError,
  T3NotFoundError,
  T3PreconditionError,
  type T3HttpErrorDetails,
} from "../errors.ts";
import { createDpopProof } from "../auth/dpop.ts";
import type { DpopPrivateJwk } from "../schemas/auth.ts";

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
  method: "GET" | "POST" | "PUT" | "DELETE";
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
  /** Errors name this and not `path`, when `path` is a credential. */
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

  async #request<T>(
    request: HttpRequest<T>,
    accessTokenOverride: string | undefined,
    hasOverride: boolean,
  ): Promise<T> {
    const errorPath = request.errorPath ?? request.path;
    const url = requestUrl(request, this.#baseUrl, errorPath);
    const credential = hasOverride
      ? { accessToken: accessTokenOverride, dpopKey: request.dpopKey }
      : await this.#sessionCredential(request);
    this.#requireCredential(request, credential.accessToken, errorPath);
    const headers = this.#requestHeaders(request, url, credential);
    const body = encodeBody(request, headers, errorPath);

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: request.method,
        headers,
        ...(body === undefined ? {} : { body }),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
    } catch (cause) {
      throw new T3ConnectionError(
        "open_failed",
        `${request.method} ${errorPath} could not reach the server.`,
        keptCause(request, cause),
      );
    }

    const raw = await readAnswer(request, response, errorPath);
    if (!response.ok) throw httpError(response.status, request.method, errorPath, raw);
    if (request.decode === "empty") return undefined as T;

    const decoded = request.decode.safeParse(raw);
    if (!decoded.success) {
      throw new T3DecodeError(`${request.method} ${errorPath}`, decoded.error, raw);
    }
    return decoded.data;
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
    const headers = new Headers(request.headers);
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
  if (request.body instanceof Uint8Array) {
    headers.set("content-type", "application/octet-stream");
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

function parseBody(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function binaryBody(bytes: Uint8Array, response: Response): unknown {
  const contentType = response.headers.get("content-type");
  return contentType === null ? { bytes } : { bytes, contentType };
}

function httpError(status: number, method: string, path: string, body: unknown): T3HttpError {
  const record = asRecord(body);
  const tag = stringField(record, "_tag");
  const reason = stringField(record, "reason") ?? stringField(record, "error");
  const traceId = stringField(record, "traceId");
  const requiredScope = stringField(record, "requiredScope");
  const details: T3HttpErrorDetails = {
    status,
    method,
    path,
    body,
    ...(tag === undefined ? {} : { tag }),
    ...(reason === undefined ? {} : { reason }),
    ...(traceId === undefined ? {} : { traceId }),
  };
  const message = `${method} ${path} failed with HTTP ${status}${reason ? ` (${reason})` : ""}.`;
  if (status === 401) return new T3AuthError(message, { ...details, code: "auth_invalid" });
  if (status === 403) {
    return new T3AuthError(message, {
      ...details,
      code: "insufficient_scope",
      ...(requiredScope === undefined ? {} : { requiredScope }),
    });
  }
  if (status === 404) return new T3NotFoundError(message, details);
  return new T3HttpError(message, details);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}
