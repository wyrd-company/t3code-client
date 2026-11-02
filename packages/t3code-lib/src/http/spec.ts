// ---
// relationships:
//   implements: library-transport
// ---
/**
 * The shape of one entry in the HTTP route registry, as `rpc/spec.ts` is for
 * RPC methods. An input has `params` for the `:name` segments of the path,
 * `query`, and `body`, each only when the route takes it.
 */
import type { z } from "zod";

import type { AuthEnvironmentScope } from "../schemas/auth.ts";

export type HttpRouteMethod = "GET" | "POST" | "PUT" | "DELETE";
export type HttpRouteAuth = "required" | "optional" | "none";

export interface HttpRouteInputShape {
  readonly params?: Record<string, string> | undefined;
  readonly query?: Record<string, string | number | undefined> | undefined;
  readonly body?: unknown;
}

export interface HttpRouteSpec<Input = unknown, Success = unknown> {
  readonly method: HttpRouteMethod;
  /** Upstream's path; `:name` segments come from `input.params`. */
  readonly path: string;
  readonly auth: HttpRouteAuth;
  /** Validates what the caller passes before it is sent. */
  readonly input: z.ZodType<Input, unknown>;
  /** Decodes a 2xx JSON response. */
  readonly success: z.ZodType<Success, unknown>;
  /** Scope the server requires; `HttpRouteClient` checks it when the session's scopes are known. */
  readonly scope?: AuthEnvironmentScope;
  /** Further scopes the server requires for this input, checked the same way. */
  inputScopes?(input: Input): readonly AuthEnvironmentScope[];
  /** Extra request headers, such as the orchestration protocol version. */
  readonly headers?: Record<string, string>;
  /** Sends `input.body` form-encoded; JSON otherwise, and a `Uint8Array` as raw bytes. */
  readonly form?: true;
  /** A 2xx answer reaches `success` as `{ bytes, contentType }`, not parsed as JSON. */
  readonly binaryResponse?: true;
  /** The path is a credential, so an error names the `path` template and not the sent path. */
  readonly signedPath?: true;
}

export type HttpRouteTable = Readonly<Record<string, HttpRouteSpec>>;

export type HttpRouteInput<Table extends HttpRouteTable, N extends keyof Table> =
  Table[N] extends HttpRouteSpec<infer Input, unknown> ? Input : never;

export type HttpRouteSuccess<Table extends HttpRouteTable, N extends keyof Table> =
  Table[N] extends HttpRouteSpec<unknown, infer Success> ? Success : never;

export function defineRoute<Input extends HttpRouteInputShape | undefined, Success>(
  spec: HttpRouteSpec<Input, Success>,
): HttpRouteSpec<Input, Success> {
  return spec;
}
