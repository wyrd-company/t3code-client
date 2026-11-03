// ---
// relationships:
//   implements: proxy
// ---
import * as NodeModule from "node:module";
import { parseArgs } from "node:util";
import { ConfigError, resolveConfig, type ProxyConfig } from "./config.ts";
import { startProxy, type ProxyService } from "./service.ts";

const help = `Usage: t3c-proxy [--config FILE] [--upstream URL] [--host ADDRESS] [--user NAME=PORT]...
       t3c-proxy [options] --list-users
       t3c-proxy --version

Show who sent each message on a shared T3 Code server. Each person has one listener.
A flag replaces the same value in the file. Any --user replaces the full users list.

  --config FILE     YAML file with upstream, host and users
  --upstream URL    The T3 Code server URL
  --host ADDRESS    The listener address (default: 127.0.0.1)
  --user NAME=PORT  One person and their listener port (repeatable)
  --list-users      Validate the config, print each port, a tab and name, then exit
  --version         Print the version
  --help            Print this help
`;

export interface CliIo {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
  /** Resolves when the service must stop. */
  readonly stop: Promise<unknown>;
}

function version(): string {
  const manifest: unknown = NodeModule.createRequire(import.meta.url)("../package.json");
  return (manifest as { version: string }).version;
}

const parse = (args: string[]) =>
  parseArgs({
    args,
    options: {
      config: { type: "string" },
      upstream: { type: "string" },
      host: { type: "string" },
      user: { type: "string", multiple: true },
      "list-users": { type: "boolean" },
      version: { type: "boolean" },
      help: { type: "boolean" },
    },
  }).values;

function signalled(): Promise<void> {
  return new Promise((resolve) => {
    process.once("SIGTERM", () => resolve());
    process.once("SIGINT", () => resolve());
  });
}

/** Runs the executable and returns its exit code. */
export async function main(
  args: string[],
  io: CliIo = {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    stop: signalled(),
  },
): Promise<number> {
  let values: ReturnType<typeof parse>;
  let config: ProxyConfig;
  try {
    values = parse(args);
    if (values.help) {
      io.out(help);
      return 0;
    }
    if (values.version) {
      io.out(`${version()}\n`);
      return 0;
    }
    config = resolveConfig(values);
  } catch (error) {
    const known =
      error instanceof ConfigError ||
      (error as { code?: string }).code?.startsWith("ERR_PARSE_ARGS");
    if (!known) throw error;
    io.err(`t3c-proxy: ${(error as Error).message}\n`);
    return 1;
  }
  if (values["list-users"]) {
    for (const user of config.users) io.out(`${user.port}\t${user.name}\n`);
    return 0;
  }
  let service: ProxyService;
  try {
    service = await startProxy(config, (line) => io.err(`${line}\n`));
  } catch (error) {
    io.err(
      `t3c-proxy: cannot listen: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}\n`,
    );
    return 1;
  }
  await io.stop;
  await service.close();
  return 0;
}
