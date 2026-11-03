// ---
// relationships:
//   implements: library-transport
// ---
/**
 * The shape of one entry in the HTTP route registry, as `rpc/spec.ts` is for
 * RPC methods. An input has `params` for the `:name` segments of the path,
 * `query`, `headers` and `body`, each only when the route takes it.
 */
import type { z } from "zod";

import type { AuthEnvironmentScope } from "../schemas/auth.ts";

export type HttpRouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type HttpRouteAuth = "required" | "optional" | "none";

export interface HttpRouteInputShape {
  readonly params?: Record<string, string> | undefined;
  readonly query?: Record<string, string | number | undefined> | undefined;
  readonly headers?: Record<string, string> | undefined;
  readonly body?: unknown;
}

export interface HttpRouteSpec<Input = unknown, Success = unknown> {
  readonly method: HttpRouteMethod;
  /** Upstream's path; `:name` segments come from `input.params`. */
  readonly path: string;
  readonly auth: HttpRouteAuth;
  /** Validates what the caller passes before it is sent. */
  readonly input: z.ZodType<Input, unknown>;
  /** Decodes a 2xx JSON response, or each event of an `eventStream` route. */
  readonly success: z.ZodType<Success, unknown>;
  /** Scope the server requires; `HttpRouteClient` checks it when the session's scopes are known. */
  readonly scope?: AuthEnvironmentScope;
  /** Further scopes the server requires for this input, checked the same way. */
  inputScopes?(input: Input): readonly AuthEnvironmentScope[];
  /** Extra request headers, such as the orchestration protocol version. */
  readonly headers?: Record<string, string>;
  /** Sends `input.body` form-encoded; JSON otherwise, and a `Uint8Array` as raw bytes. */
  readonly form?: true;
  /**
   * Sends `input.body` as `multipart/form-data`: each file of `files` is a part, and each other
   * string is a field.
   */
  readonly multipart?: true;
  /** The name of a `multipart` route's file parts. The default is `files`. */
  readonly multipartFileField?: string;
  /** A 2xx answer reaches `success` as `{ bytes, contentType }`, not parsed as JSON. */
  readonly binaryResponse?: true;
  /**
   * A 3xx answer is not followed, and reaches `success` as `{ location }`. A browser's `fetch`
   * hides that header, so `call` raises `T3PreconditionError` there.
   */
  readonly redirectResponse?: true;
  /**
   * The path or the query is a credential, so an error names the `path` template and not the sent
   * path, and keeps no cause.
   */
  readonly signedPath?: true;
  /** The answer is server-sent events: `HttpRouteClient.stream` reads it, and `call` refuses. */
  readonly eventStream?: true;
}

/** A route that `HttpRouteClient.stream` reads. */
export type HttpEventStreamRouteSpec<Input = unknown, Success = unknown> = HttpRouteSpec<
  Input,
  Success
> & { readonly eventStream: true };

export type HttpRouteTable = Readonly<Record<string, HttpRouteSpec>>;

export type HttpRouteInput<Table extends HttpRouteTable, N extends keyof Table> =
  Table[N] extends HttpRouteSpec<infer Input, unknown> ? Input : never;

export type HttpRouteSuccess<Table extends HttpRouteTable, N extends keyof Table> =
  Table[N] extends HttpRouteSpec<unknown, infer Success> ? Success : never;

/** The names of a table's event stream routes. */
export type HttpEventStreamRouteName<Table extends HttpRouteTable> = {
  [N in keyof Table]: Table[N] extends { readonly eventStream: true } ? N : never;
}[keyof Table] &
  string;

export function defineRoute<Input extends HttpRouteInputShape | undefined, Success>(
  spec: HttpRouteSpec<Input, Success>,
): HttpRouteSpec<Input, Success> {
  return spec;
}

export function defineEventStreamRoute<Input extends HttpRouteInputShape | undefined, Success>(
  spec: Omit<HttpRouteSpec<Input, Success>, "eventStream">,
): HttpEventStreamRouteSpec<Input, Success> {
  return { ...spec, eventStream: true };
}
