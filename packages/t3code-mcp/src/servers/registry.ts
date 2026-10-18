// ---
// relationships:
//   implements: mcp
//   references: profiles
// ---
import {
  ProfileManager,
  T3Client,
  memoryCredentialStore,
  type T3ClientOptions,
} from "@wyrd-company/t3code-lib";
import type { McpConfig } from "../config/schema.ts";
import { ToolError } from "../errors.ts";
import { assertAllowed } from "../policy/policy.ts";
import { SERVER_DEADLINE_MS, withSignal } from "./acquisition.ts";
import { CredentialRedactor } from "./credentials.ts";

/** The tool seam is the public library facade; no protocol knowledge belongs here. */
export type ServerClient = Pick<T3Client, "server" | "threads" | "projects" | "shell" | "close">;
export interface Registry {
  readonly config: McpConfig;
  resolve(server?: string): string;
  client(server: string, tool: string, signal?: AbortSignal): Promise<ServerClient>;
  error(error: unknown): Promise<ToolError>;
  close(): Promise<void>;
}
interface Acquisition {
  controller: AbortController;
  promise: Promise<ServerClient>;
  users: number;
}
export class ServerRegistry implements Registry {
  readonly config: McpConfig;
  readonly #profiles: Pick<ProfileManager, "resolveProfile">;
  readonly #env: NodeJS.ProcessEnv;
  readonly #create: (options: T3ClientOptions) => ServerClient;
  readonly #clients = new Map<string, ServerClient>();
  readonly #pending = new Map<string, Acquisition>();
  readonly #shutdown = new AbortController();
  readonly #credentials: CredentialRedactor;
  #closing: Promise<void> | undefined;
  #closed = false;
  constructor(
    config: McpConfig,
    options: {
      profiles?: Pick<ProfileManager, "resolveProfile">;
      env?: NodeJS.ProcessEnv;
      create?: (options: T3ClientOptions) => ServerClient;
    } = {},
  ) {
    this.config = config;
    this.#profiles = options.profiles ?? new ProfileManager();
    this.#env = options.env ?? process.env;
    this.#create = options.create ?? T3Client.create;
    this.#credentials = new CredentialRedactor(
      config,
      this.#profiles,
      this.#env,
      this.#shutdown.signal,
    );
  }
  resolve(server?: string): string {
    const name =
      server ??
      this.config.defaultServer ??
      (Object.keys(this.config.servers).length === 1
        ? Object.keys(this.config.servers)[0]
        : undefined);
    if (name === undefined) throw new ToolError("server_required", "Name a configured server.");
    if (!Object.hasOwn(this.config.servers, name))
      throw new ToolError("server_unknown", "Server is not configured.");
    return name;
  }
  async client(server: string, tool: string, signal?: AbortSignal): Promise<ServerClient> {
    const name = this.resolve(server);
    assertAllowed(tool, this.config.serverPolicies[name] ?? {});
    if (this.#closed) throw new ToolError("invalid_state", "MCP session is closed.");
    signal?.throwIfAborted();
    const client = this.#clients.get(name);
    if (client) return client;
    const pending = this.#pending.get(name) ?? this.#acquire(name);
    pending.users++;
    try {
      return await withSignal(pending.promise, signal ?? this.#shutdown.signal);
    } finally {
      if (--pending.users === 0 && this.#pending.get(name) === pending) {
        this.#pending.delete(name);
        pending.controller.abort();
      }
    }
  }
  #acquire(name: string): Acquisition {
    const controller = new AbortController();
    const timeout = setTimeout(
      () =>
        controller.abort(
          new ToolError("server_unreachable", "Server acquisition exceeded the 5 s deadline."),
        ),
      SERVER_DEADLINE_MS,
    );
    const opening = Promise.resolve()
      .then(() => this.#open(name, controller.signal))
      .then(async (client) => {
        if (controller.signal.aborted || this.#closed) {
          await client.close();
          controller.signal.throwIfAborted();
          throw new ToolError("invalid_state", "MCP session is closed.");
        }
        this.#clients.set(name, client);
        return client;
      });
    const pending: Acquisition = {
      controller,
      users: 0,
      promise: withSignal(opening, controller.signal).finally(() => {
        clearTimeout(timeout);
        if (this.#pending.get(name) === pending) this.#pending.delete(name);
      }),
    };
    this.#pending.set(name, pending);
    return pending;
  }
  async #open(name: string, signal: AbortSignal): Promise<ServerClient> {
    signal.throwIfAborted();
    const entry = this.config.servers[name]!;
    const connection =
      "url" in entry
        ? {
            baseUrl: entry.url,
            credentials: memoryCredentialStore({ accessToken: this.#token(entry.tokenEnv) }),
          }
        : await this.#profiles.resolveProfile(entry.profile ?? name);
    signal.throwIfAborted();
    return this.#create({
      ...connection,
      credentials: this.#credentials.recording(name, connection.credentials),
      clientLabel: "t3code-mcp",
    });
  }
  #token(key: string): string {
    const token = this.#env[key];
    if (!token?.trim())
      throw new ToolError("auth_invalid", "Configured token environment variable is unset.");
    return token.trim();
  }
  async error(error: unknown): Promise<ToolError> {
    return this.#credentials.error(error);
  }
  async close(): Promise<void> {
    this.#closed = true;
    this.#shutdown.abort(new ToolError("invalid_state", "MCP session is closed."));
    for (const pending of this.#pending.values())
      pending.controller.abort(this.#shutdown.signal.reason);
    this.#pending.clear();
    const clients = [...this.#clients.values()];
    this.#clients.clear();
    await (this.#closing ??= Promise.all(clients.map((client) => client.close())).then(() => {}));
  }
}
