// ---
// relationships:
//   implements: proxy
// ---
import * as NodeFS from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export interface ProxyUser {
  readonly name: string;
  readonly port: number;
}

export interface ProxyConfig {
  readonly upstream: URL;
  readonly host: string;
  readonly users: readonly ProxyUser[];
}

export interface ConfigFlags {
  readonly config?: string | undefined;
  readonly upstream?: string | undefined;
  readonly host?: string | undefined;
  readonly user?: readonly string[] | undefined;
}

/** A config problem. The service stops before it listens. */
export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

const DEFAULT_HOST = "127.0.0.1";
const LINE_BREAK = /[\n\r\v\f\x85\u2028\u2029]/u;

const nameSchema = z
  .string()
  .refine((name) => name.trim() !== "", "must not be empty")
  .refine((name) => !LINE_BREAK.test(name), "must be on one line");
const portSchema = z.number().int().min(1).max(65535);
const fileSchema = z.strictObject({
  upstream: z.string().optional(),
  host: z.string().min(1).optional(),
  users: z.array(z.strictObject({ name: nameSchema, port: portSchema })).optional(),
});

function parseFlagUser(entry: string): ProxyUser {
  const separator = entry.lastIndexOf("=");
  const port = entry.slice(separator + 1);
  const name = nameSchema.safeParse(entry.slice(0, Math.max(separator, 0)));
  const parsedPort = portSchema.safeParse(Number(port));
  if (separator < 0 || !/^\d+$/u.test(port) || !name.success || !parsedPort.success) {
    throw new ConfigError("--user must be <name>=<port>, with a valid name and port.");
  }
  return { name: name.data, port: parsedPort.data };
}

function readFile(path: string): z.infer<typeof fileSchema> {
  let source: string;
  try {
    source = NodeFS.readFileSync(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "unknown error";
    throw new ConfigError(`Cannot read the config file ${path}: ${code}.`);
  }
  let document: unknown;
  try {
    document = parseYaml(source);
  } catch {
    throw new ConfigError(`The config file ${path} is not valid YAML.`);
  }
  const file = fileSchema.safeParse(document);
  if (!file.success) {
    throw new ConfigError(`The config file ${path} is invalid:\n${z.prettifyError(file.error)}`);
  }
  return file.data;
}

function parseUpstream(value: string | undefined): URL {
  if (value === undefined) throw new ConfigError("Give the server URL with upstream.");
  const url = URL.canParse(value) ? new URL(value) : undefined;
  const valid =
    url !== undefined &&
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "";
  if (!valid) {
    throw new ConfigError("upstream must be an http or https URL with no path or credentials.");
  }
  return url;
}

function checkUsers(users: readonly ProxyUser[] | undefined): readonly ProxyUser[] {
  if (users === undefined || users.length === 0) {
    throw new ConfigError("Give at least one person with users or --user.");
  }
  if (new Set(users.map((user) => user.name)).size !== users.length) {
    throw new ConfigError("A name must occur only once.");
  }
  if (new Set(users.map((user) => user.port)).size !== users.length) {
    throw new ConfigError("A port must occur only once.");
  }
  return users;
}

/** Combines the file and flags. A flag replaces the same value in the file. */
export function resolveConfig(flags: ConfigFlags): ProxyConfig {
  const file = flags.config === undefined ? {} : readFile(flags.config);
  if (flags.host === "") throw new ConfigError("--host must not be empty.");
  const flagUsers = flags.user?.map(parseFlagUser);
  return {
    upstream: parseUpstream(flags.upstream ?? file.upstream),
    host: flags.host ?? file.host ?? DEFAULT_HOST,
    users: checkUsers(flagUsers ?? file.users),
  };
}
