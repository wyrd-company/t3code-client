// ---
// relationships:
//   implements: mcp
// ---
import type { ProfileManager } from "@wyrd-company/t3code-lib";
import type { McpConfig } from "../config/schema.ts";
import { ToolError, toToolError } from "../errors.ts";
import { SERVER_DEADLINE_MS, withSignal } from "./acquisition.ts";

/** A session snapshot: formatting never waits for profile or credential I/O. */
export class CredentialSnapshot {
  #tokens: string[] | undefined;
  constructor(
    config: McpConfig,
    profiles: Pick<ProfileManager, "resolveProfile">,
    env: NodeJS.ProcessEnv,
    signal: AbortSignal,
  ) {
    const entries = Object.entries(config.servers);
    const direct = entries.flatMap(([, entry]) =>
      "url" in entry ? [env[entry.tokenEnv]?.trim() ?? ""] : [],
    );
    if (direct.length === entries.length) {
      this.#tokens = direct;
      return;
    }
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    const timeout = setTimeout(() => controller.abort(), SERVER_DEADLINE_MS);
    timeout.unref();
    void withSignal(
      Promise.all(
        entries.map(async ([name, entry]) =>
          "url" in entry
            ? (env[entry.tokenEnv]?.trim() ?? "")
            : ((await (await profiles.resolveProfile(entry.profile ?? name)).credentials.load())
                .accessToken ?? ""),
        ),
      ),
      combined,
    )
      .then((tokens) => {
        if (!combined.aborted) this.#tokens = tokens;
      })
      .catch(() => {})
      .finally(() => clearTimeout(timeout));
  }
  error(error: unknown): ToolError {
    return this.#tokens === undefined
      ? new ToolError(toToolError(error).code, "The upstream operation failed.")
      : toToolError(error, this.#tokens);
  }
}
