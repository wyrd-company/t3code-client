// ---
// relationships:
//   implements: command-line
//   references: profiles
// ---
import { ProfileManager, T3Client, type ResolvedProfile } from "@wyrd-company/t3code-lib";
import { durationMs } from "./options.ts";
import { Output } from "./output.ts";
import type { ErrorContext } from "./errors.ts";

export interface GlobalOptions {
  server?: string;
  credentials?: string;
  json?: boolean;
  logLevel?: string;
  connectTimeout?: string;
  stream?: boolean;
}
export interface Invocation {
  readonly options: GlobalOptions;
  readonly output: Output;
  readonly startedAt: number;
  readonly profiles: ProfileManager;
  errorContext: ErrorContext;
  resolve(): Promise<ResolvedProfile>;
  client(): Promise<T3Client>;
  close(): Promise<void>;
}

/** Lazy connection, so help/version and local auth operations need no server. */
export function createInvocation(
  options: GlobalOptions,
  output: Output,
  profiles = new ProfileManager(),
  clientAppVersion?: string,
): Invocation {
  let connection: ResolvedProfile | undefined;
  let client: T3Client | undefined;
  const invocation: Invocation = {
    options,
    output,
    profiles,
    startedAt: Date.now(),
    errorContext: "local",
    async resolve() {
      if (connection !== undefined) return connection;
      const previousContext = invocation.errorContext;
      invocation.errorContext = "local";
      connection = await profiles.resolve({
        ...(options.server === undefined ? {} : { server: options.server }),
        ...(options.credentials === undefined ? {} : { credentialsFile: options.credentials }),
      });
      invocation.errorContext = previousContext;
      return connection;
    },
    async client() {
      if (client !== undefined) return client;
      const resolved = await invocation.resolve();
      client = T3Client.create({
        ...resolved,
        credentials: {
          async load() {
            try {
              return await resolved.credentials.load();
            } catch (error) {
              invocation.errorContext = "local";
              throw error;
            }
          },
          async save(value) {
            try {
              await resolved.credentials.save(value);
            } catch (error) {
              invocation.errorContext = "local";
              throw error;
            }
          },
          async clear() {
            try {
              await resolved.credentials.clear();
            } catch (error) {
              invocation.errorContext = "local";
              throw error;
            }
          },
        },
        clientLabel: "t3c",
        ...(clientAppVersion === undefined ? {} : { clientAppVersion }),
        openTimeoutMs: durationMs(options.connectTimeout ?? "30s"),
        logger: {
          debug: () => diagnostic("debug"),
          info: () => diagnostic("info"),
          warn: () => diagnostic("warn"),
          error: () => diagnostic("error"),
        },
      });
      if (invocation.errorContext === "local") invocation.errorContext = "connection";
      return client;
    },
    async close() {
      await client?.close();
    },
  };
  const levels = ["silent", "error", "warn", "info", "debug"];
  function diagnostic(level: string) {
    // Transport log payloads can contain caller/server data. Emit level only.
    if (levels.indexOf(level) <= levels.indexOf(options.logLevel ?? "warn"))
      output.progress(`t3c: ${level}: transport diagnostic`);
  }
  return invocation;
}
