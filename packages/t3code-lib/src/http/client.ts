// ---
// relationships:
//   implements: library-transport
// ---
/**
 * Calls a route of the table: validates the input, fills the path, and decodes
 * the answer. `callRoute` is what the facades use; `HttpRouteClient` is the
 * public entry, by name, with the local scope check that `RpcClient` also does.
 */
import { ensureScopes } from "../auth/scopes.ts";
import {
  T3ConnectionError,
  T3DecodeError,
  T3Error,
  T3InterruptedError,
  T3PreconditionError,
} from "../errors.ts";
import type { StreamItem } from "../rpc/client.ts";
import type { AuthGrantedScope, DpopPrivateJwk } from "../schemas/auth.ts";
import { serverSentEventData } from "../transport/eventStream.ts";
import type { HttpRequest, HttpTransport } from "../transport/http.ts";
import { parseBody } from "../transport/httpAnswer.ts";
import type {
  HttpEventStreamRouteName,
  HttpRouteInput,
  HttpRouteInputShape,
  HttpRouteSpec,
  HttpRouteSuccess,
  HttpRouteTable,
} from "./spec.ts";

export interface CallRouteOptions {
  readonly signal?: AbortSignal | undefined;
  /** Signs a request that has no session yet, such as a token exchange. */
  readonly dpopKey?: DpopPrivateJwk | undefined;
}

export function callRoute<Input, Success>(
  http: HttpTransport,
  route: HttpRouteSpec<Input, Success>,
  input: Input,
  options: CallRouteOptions = {},
): Promise<Success> {
  return http.request(routeRequest(route, parseRouteInput(route, input), options));
}

/** The request of one validated input. `setAccessToken` sends it with a candidate token. */
export function routeRequest<Input, Success>(
  route: HttpRouteSpec<Input, Success>,
  input: Input,
  options: CallRouteOptions = {},
): HttpRequest<Success> {
  const shape: HttpRouteInputShape = input ?? {};
  return {
    method: route.method,
    path: routePath(route.path, shape.params),
    auth: route.auth,
    decode: route.success,
    ...(shape.query === undefined ? {} : { query: shape.query }),
    ...(shape.body === undefined ? {} : { body: encodeRouteBody(route, shape.body) }),
    ...(route.headers === undefined && shape.headers === undefined
      ? {}
      : { headers: { ...route.headers, ...shape.headers } }),
    ...(route.binaryResponse === true ? { binaryResponse: true } : {}),
    ...(route.redirectResponse === true ? { redirectResponse: true } : {}),
    ...(route.signedPath === true ? { errorPath: route.path } : {}),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.dpopKey === undefined ? {} : { dpopKey: options.dpopKey }),
  };
}

function parseRouteInput<Input, Success>(
  route: HttpRouteSpec<Input, Success>,
  input: Input,
): Input {
  const result = route.input.safeParse(input);
  if (!result.success) {
    throw new T3PreconditionError(
      `${route.method} ${route.path} input is invalid: ${result.error.message}`,
    );
  }
  return result.data;
}

function routePath(path: string, params: Record<string, string> | undefined): string {
  return path.replace(/:(\w+)/gu, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new T3PreconditionError(`${path} needs the ${name} parameter.`);
    return encodeURIComponent(value);
  });
}

function encodeRouteBody<Input, Success>(route: HttpRouteSpec<Input, Success>, body: unknown) {
  if (route.form === true) return formBody(body);
  return route.multipart === true ? multipartBody(body, route.multipartFileField) : body;
}

function multipartBody(body: unknown, fileField = "files"): FormData {
  const form = new FormData();
  const { files = [], ...fields } = body as {
    readonly files?: readonly MultipartFile[];
    readonly [field: string]: unknown;
  };
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === "string") form.append(name, value);
  }
  for (const file of files) {
    const content = new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.mimeType });
    form.append(fileField, content, file.name);
  }
  return form;
}

interface MultipartFile {
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

function formBody(body: unknown): URLSearchParams {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === "string") form.set(key, value);
  }
  return form;
}

async function* routeEvents<Input, Success>(
  http: HttpTransport,
  route: HttpRouteSpec<Input, Success>,
  input: Input,
  signal: AbortSignal | undefined,
): AsyncGenerator<StreamItem<Success>> {
  const request = routeRequest(route, input, { signal });
  const source = `${route.method} ${route.path}`;
  try {
    const response = await http.openResponse({
      ...request,
      headers: { accept: "text/event-stream", ...request.headers },
    });
    if (response.body === null) return;
    for await (const data of serverSentEventData(response.body)) {
      // The reader can hold more events after an abort.
      signal?.throwIfAborted();
      const raw = parseBody(data);
      const decoded = route.success.safeParse(raw);
      yield decoded.success
        ? { kind: "item", value: decoded.data }
        : { kind: "decode-error", error: new T3DecodeError(source, decoded.error, raw) };
    }
  } catch (cause) {
    if (signal?.aborted === true) {
      throw new T3InterruptedError(`${source} was aborted.`, { cause });
    }
    if (cause instanceof T3Error) throw cause;
    throw new T3ConnectionError("closed", `${source} lost its connection.`, { cause });
  }
}

export interface HttpRouteClientOptions {
  /** The session's scopes when known; a route's scope is then checked before sending. */
  readonly getScopes?: () => readonly AuthGrantedScope[] | undefined;
}

/** Every HTTP route of the target build by name, with validated input and a decoded answer. */
export class HttpRouteClient<Table extends HttpRouteTable> {
  readonly #http: HttpTransport;
  readonly #table: Table;
  readonly #getScopes: (() => readonly AuthGrantedScope[] | undefined) | undefined;

  constructor(http: HttpTransport, table: Table, options: HttpRouteClientOptions = {}) {
    this.#http = http;
    this.#table = table;
    this.#getScopes = options.getScopes;
  }

  /** Validate the input, check the known scopes, send the request and decode the answer. */
  async call<N extends keyof Table & string>(
    name: N,
    ...args: undefined extends HttpRouteInput<Table, N>
      ? [input?: HttpRouteInput<Table, N>, signal?: AbortSignal]
      : [input: HttpRouteInput<Table, N>, signal?: AbortSignal]
  ): Promise<HttpRouteSuccess<Table, N>> {
    const route = this.#table[name];
    if (route === undefined) throw new T3PreconditionError(`Unknown HTTP route ${name}.`);
    const [input, signal] = args;
    if (route.eventStream === true) {
      throw new T3PreconditionError(`HTTP route ${name} is an event stream. Use stream.`);
    }
    const parsed = parseRouteInput(route, input);
    this.#checkScopes(name, route, parsed);
    return this.#http.request(routeRequest(route, parsed, { signal })) as Promise<
      HttpRouteSuccess<Table, N>
    >;
  }

  /**
   * Validate the input, check the known scopes, and read the events of an event stream route. An
   * event that does not decode is a `decode-error` item, and the stream continues. Ending the
   * iteration or aborting `signal` closes the request. An abort raises `T3InterruptedError`, and a
   * lost connection raises `T3ConnectionError`.
   */
  async *stream<N extends HttpEventStreamRouteName<Table>>(
    name: N,
    ...args: undefined extends HttpRouteInput<Table, N>
      ? [input?: HttpRouteInput<Table, N>, signal?: AbortSignal]
      : [input: HttpRouteInput<Table, N>, signal?: AbortSignal]
  ): AsyncGenerator<StreamItem<HttpRouteSuccess<Table, N>>> {
    const route = this.#table[name];
    if (route === undefined) throw new T3PreconditionError(`Unknown HTTP route ${name}.`);
    if (route.eventStream !== true) {
      throw new T3PreconditionError(`HTTP route ${name} is not an event stream. Use call.`);
    }
    const [input, signal] = args;
    const parsed = parseRouteInput(route, input);
    this.#checkScopes(name, route, parsed);
    const events = routeEvents(this.#http, route, parsed, signal);
    yield* events as AsyncGenerator<StreamItem<HttpRouteSuccess<Table, N>>>;
  }

  #checkScopes(name: string, route: HttpRouteSpec, input: unknown): void {
    const granted = this.#getScopes?.();
    if (granted === undefined) return;
    ensureScopes(
      granted,
      [...(route.scope === undefined ? [] : [route.scope]), ...(route.inputScopes?.(input) ?? [])],
      name,
    );
  }
}
