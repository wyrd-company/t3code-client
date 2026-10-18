// ---
// relationships:
//   implements: mcp
// ---
import type { CredentialStore, ProfileManager } from "@wyrd-company/t3code-lib";
import type { McpConfig } from "../config/schema.ts";
import { ToolError, toToolError } from "../errors.ts";
import { SERVER_DEADLINE_MS, withSignal } from "./acquisition.ts";

/** Session redaction values follow every credential read and write without formatting I/O. */
export class CredentialRedactor {
  readonly #tokens = new Set<string>();
  readonly #known = new Set<string>();
  readonly #serverCount: number;
  constructor(
    config: McpConfig,
    profiles: Pick<ProfileManager, "resolveProfile">,
    env: NodeJS.ProcessEnv,
    signal: AbortSignal,
  ) {
    const entries = Object.entries(config.servers);
    this.#serverCount = entries.length;
    for (const [name, entry] of entries) {
      if ("url" in entry) {
        this.#record(env[entry.tokenEnv]?.trim());
        this.#known.add(name);
      }
    }
    if (this.#known.size === this.#serverCount) return;
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    const timeout = setTimeout(() => controller.abort(), SERVER_DEADLINE_MS);
    timeout.unref();
    void withSignal(
      Promise.all(
        entries.map(async ([name, entry]) => {
          if ("url" in entry) return;
          const { credentials } = await profiles.resolveProfile(entry.profile ?? name);
          await this.recording(name, credentials).load();
        }),
      ),
      combined,
    )
      .catch(() => {})
      .finally(() => clearTimeout(timeout));
  }
  recording(server: string, store: CredentialStore): CredentialStore {
    return {
      load: async () => {
        const credentials = await store.load();
        this.#record(credentials);
        this.#known.add(server);
        return credentials;
      },
      save: (credentials) => {
        // A failed save can echo its input, so record before calling the store.
        this.#record(credentials);
        return store.save(credentials);
      },
      clear: () => store.clear(),
    };
  }
  #record(value: unknown): void {
    if (typeof value === "string") {
      if (value) this.#tokens.add(value);
    } else if (Array.isArray(value)) {
      for (const item of value) this.#record(item);
    } else if (value !== null && typeof value === "object") {
      for (const item of Object.values(value)) this.#record(item);
    }
  }
  error(error: unknown): ToolError {
    return this.#known.size !== this.#serverCount
      ? new ToolError(toToolError(error).code, "The upstream operation failed.")
      : toToolError(error, [...this.#tokens]);
  }
}
