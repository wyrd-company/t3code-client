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
import { ToolError, toToolError } from "../errors.ts";
import { assertAllowed } from "../policy/policy.ts";

/** The tool seam is the public library facade; no protocol knowledge belongs here. */
export type ServerClient = Pick<T3Client, "server" | "threads" | "projects" | "shell" | "close">;
export interface Registry {
  readonly config: McpConfig;
  resolve(server?: string): string;
  client(server: string, tool: string): Promise<ServerClient>;
  error(error: unknown): Promise<ToolError>;
  close(): Promise<void>;
}
export class ServerRegistry implements Registry {
  readonly config: McpConfig;
  readonly #profiles: Pick<ProfileManager, "resolveProfile">;
  readonly #env: NodeJS.ProcessEnv;
  readonly #create: (options: T3ClientOptions) => ServerClient;
  readonly #clients = new Map<string, Promise<ServerClient>>();
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
  async client(server: string, tool: string): Promise<ServerClient> {
    const name = this.resolve(server);
    assertAllowed(tool, this.config.serverPolicies[name] ?? {});
    if (this.#closed) throw new ToolError("invalid_state", "MCP session is closed.");
    let pending = this.#clients.get(name);
    if (!pending) {
      pending = this.#open(name);
      this.#clients.set(name, pending);
      void pending.catch(() => {
        if (this.#clients.get(name) === pending) this.#clients.delete(name);
      });
    }
    return pending;
  }
  async #open(name: string): Promise<ServerClient> {
    const entry = this.config.servers[name]!;
    const connection =
      "url" in entry
        ? {
            baseUrl: entry.url,
            credentials: memoryCredentialStore({ accessToken: this.#token(entry.tokenEnv) }),
          }
        : await this.#profiles.resolveProfile(entry.profile ?? name);
    return this.#create({ ...connection, clientLabel: "t3code-mcp" });
  }
  #token(key: string): string {
    const token = this.#env[key];
    if (!token?.trim())
      throw new ToolError("auth_invalid", "Configured token environment variable is unset.");
    return token.trim();
  }
  async error(error: unknown): Promise<ToolError> {
    try {
      // Collect all configured credentials, including peers that have not opened.
      const tokens = await Promise.all(
        Object.entries(this.config.servers).map(async ([name, entry]) =>
          "url" in entry
            ? (this.#env[entry.tokenEnv]?.trim() ?? "")
            : ((
                await (
                  await this.#profiles.resolveProfile(entry.profile ?? name)
                ).credentials.load()
              ).accessToken ?? ""),
        ),
      );
      return toToolError(error, tokens);
    } catch {
      // Without a complete credential set, do not forward upstream text.
      return new ToolError(toToolError(error).code, "The upstream operation failed.");
    }
  }
  async close(): Promise<void> {
    this.#closed = true;
    const clients = await Promise.allSettled(this.#clients.values());
    this.#clients.clear();
    await Promise.all(
      clients.map((result) => (result.status === "fulfilled" ? result.value.close() : undefined)),
    );
  }
}
