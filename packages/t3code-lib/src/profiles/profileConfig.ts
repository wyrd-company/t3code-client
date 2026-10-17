// ---
// relationships:
//   implements: profiles
// ---
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { z } from "zod";
import { T3StorageError, T3PreconditionError } from "../errors.ts";
import { environmentValue } from "./environment.ts";

/** A named server; credentials are stored separately. */
export interface Profile {
  readonly name: string;
  readonly url: string;
}

/** Contents of config.json. Credentials never belong in this object. */
export interface ProfileConfig {
  servers: Record<string, { url: string }>;
  current?: string;
}

const Config = z.looseObject({
  servers: z.custom<Record<string, unknown>>(
    (value) => typeof value === "object" && value !== null && !Array.isArray(value),
  ),
  current: z.string().min(1).optional(),
});

export function configDirectory(env: NodeJS.ProcessEnv = process.env): string {
  const override = environmentValue(env, "T3C_CONFIG_HOME");
  if (override !== undefined) return NodePath.resolve(override);
  const xdg = environmentValue(env, "XDG_CONFIG_HOME");
  const base = xdg && NodePath.isAbsolute(xdg) ? xdg : NodePath.join(NodeOS.homedir(), ".config");
  return NodePath.join(base, "t3c");
}

export function credentialPath(directory: string, name: string): string {
  const key = NodeCrypto.createHash("sha256").update(name).digest("hex");
  return NodePath.join(directory, "credentials", `${key}.json`);
}

export function serverUrl(input: string): string {
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.origin;
  } catch {
    throw new T3PreconditionError("Server URL must be an absolute HTTP or HTTPS URL.");
  }
}

export function profileNamed(config: ProfileConfig, name: string): Profile {
  if (!Object.hasOwn(config.servers, name)) {
    throw new T3PreconditionError("The selected profile does not exist.");
  }
  return { name, url: config.servers[name]!.url };
}

export async function loadConfig(directory: string): Promise<ProfileConfig> {
  let text: string;
  try {
    text = await NodeFSP.readFile(NodePath.join(directory, "config.json"), "utf8");
  } catch (cause) {
    if (isMissing(cause)) return { servers: {} };
    throw configIoError("read", directory, cause);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new T3PreconditionError("Profile configuration is not valid JSON.");
  }
  const parsed = Config.safeParse(raw);
  if (!parsed.success) throw new T3PreconditionError("Profile configuration has an invalid shape.");
  const servers: ProfileConfig["servers"] = Object.create(null);
  for (const [name, rawServer] of Object.entries(parsed.data.servers)) {
    const server = z.looseObject({ url: z.string().min(1) }).safeParse(rawServer);
    if (name.length === 0 || !server.success)
      throw new T3PreconditionError("Profile configuration has an invalid server.");
    servers[name] = { ...server.data, url: serverUrl(server.data.url) };
  }
  const { current, ...rest } = parsed.data;
  const config: ProfileConfig = { ...rest, servers, ...(current === undefined ? {} : { current }) };
  if (config.current !== undefined) profileNamed(config, config.current);
  return config;
}

export async function saveConfig(directory: string, config: ProfileConfig): Promise<void> {
  const temporary = NodePath.join(directory, `.config.${NodeCrypto.randomUUID()}.tmp`);
  try {
    await NodeFSP.mkdir(directory, { recursive: true });
    await NodeFSP.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await NodeFSP.chmod(temporary, 0o644);
    await NodeFSP.rename(temporary, NodePath.join(directory, "config.json"));
  } catch (cause) {
    await NodeFSP.unlink(temporary).catch(() => undefined);
    throw configIoError("write", directory, cause);
  }
}

export async function prepareCredentials(directory: string): Promise<void> {
  try {
    await NodeFSP.mkdir(NodePath.join(directory, "credentials"), { recursive: true });
  } catch (cause) {
    throw configIoError("create credential directory", directory, cause);
  }
}

function isMissing(cause: unknown): boolean {
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT";
}

function configIoError(action: string, directory: string, cause: unknown): T3StorageError {
  return new T3StorageError(`Could not ${action} profile configuration in ${directory}.`, {
    cause,
  });
}
