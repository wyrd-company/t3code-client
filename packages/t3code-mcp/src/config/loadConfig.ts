// ---
// relationships:
//   implements: mcp
//   references: profiles
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { ProfileManager } from "@wyrd-company/t3code-lib";
import { configFile, type ConfigFlags, type McpConfig } from "./schema.ts";

export const splitList = (value: string) =>
  value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
const envValue = (env: NodeJS.ProcessEnv, key: string) => env[key]?.trim() || undefined;

/** Flags > environment > file > shared profiles. Credentials are resolved lazily. */
export async function loadConfig(
  flags: ConfigFlags = {},
  options: { env?: NodeJS.ProcessEnv; profiles?: Pick<ProfileManager, "list">; home?: string } = {},
): Promise<McpConfig> {
  const env = options.env ?? process.env;
  const home = options.home ?? NodeOS.homedir();
  const xdg = envValue(env, "XDG_CONFIG_HOME");
  const configHome = xdg && NodePath.isAbsolute(xdg) ? xdg : NodePath.join(home, ".config");
  const explicit = flags.config ?? envValue(env, "T3CODE_MCP_CONFIG");
  const path = explicit ?? NodePath.join(configHome, "t3code-mcp/config.json");
  let raw: unknown = {};
  try {
    const contents = await NodeFSP.readFile(path, "utf8");
    try {
      raw = JSON.parse(contents);
    } catch {
      throw new Error("Invalid MCP config JSON.");
    }
  } catch (error) {
    if (explicit !== undefined || (error as NodeJS.ErrnoException).code !== "ENOENT") {
      // Parser errors can contain config values; withhold their original cause.
      // oxlint-disable-next-line eslint/preserve-caught-error
      throw new Error("Could not load MCP config file.");
    }
  }
  const parsed = configFile.safeParse(raw);
  if (!parsed.success) throw new Error("Invalid MCP config shape.");
  const file = parsed.data;
  const profiles =
    options.profiles ??
    new ProfileManager({
      configDir: envValue(env, "T3C_CONFIG_HOME") ?? NodePath.join(configHome, "t3c"),
    });
  const available =
    file.servers ?? Object.fromEntries((await profiles.list()).map((p) => [p.name, {}]));
  const selected =
    flags.servers ??
    (envValue(env, "T3CODE_MCP_SERVERS") === undefined
      ? undefined
      : splitList(env["T3CODE_MCP_SERVERS"]!));
  if (selected?.some((name) => !Object.hasOwn(available, name)))
    throw new Error("Selected MCP server is not configured.");
  const servers =
    selected === undefined
      ? available
      : Object.fromEntries(selected.map((name) => [name, available[name]!]));
  const defaultServer =
    flags.defaultServer ?? envValue(env, "T3CODE_MCP_DEFAULT_SERVER") ?? file.defaultServer;
  if (defaultServer !== undefined && !Object.hasOwn(servers, defaultServer))
    throw new Error("Default MCP server is not selected.");
  const readOnlyEnv = envValue(env, "T3CODE_MCP_READ_ONLY");
  if (readOnlyEnv !== undefined && !["0", "1"].includes(readOnlyEnv))
    throw new Error("T3CODE_MCP_READ_ONLY must be 0 or 1.");
  return {
    servers,
    ...(defaultServer === undefined ? {} : { defaultServer }),
    allowTools:
      flags.allowTools ??
      (envValue(env, "T3CODE_MCP_ALLOW_TOOLS") === undefined
        ? (file.allowTools ?? ["*"])
        : splitList(env["T3CODE_MCP_ALLOW_TOOLS"]!)),
    denyTools:
      flags.denyTools ??
      (envValue(env, "T3CODE_MCP_DENY_TOOLS") === undefined
        ? (file.denyTools ?? [])
        : splitList(env["T3CODE_MCP_DENY_TOOLS"]!)),
    readOnly:
      flags.readOnly ??
      (readOnlyEnv === undefined ? (file.readOnly ?? false) : readOnlyEnv === "1"),
    serverPolicies: file.serverPolicies ?? {},
  };
}
