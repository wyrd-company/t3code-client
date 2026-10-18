#!/usr/bin/env node
// ---
// relationships:
//   implements: mcp
// ---
import * as NodeUtil from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { ProfileManager } from "@wyrd-company/t3code-lib";
import { loadConfig, splitList } from "./config/loadConfig.ts";
import { ServerRegistry } from "./servers/registry.ts";
import { createServer, allTools, SERVER_VERSION } from "./server.ts";
import { exposed } from "./policy/policy.ts";
import { toToolError } from "./errors.ts";
const HELP = `t3code-mcp [serve] [options]
t3code-mcp pair <name> <url> [--token <pairing-token>]  (otherwise stdin)
t3code-mcp servers [--probe]
t3code-mcp tools
t3code-mcp --version | --help

--config <path>            MCP config JSON (T3CODE_MCP_CONFIG)
--server <name>            Select server, repeatable (T3CODE_MCP_SERVERS)
--default-server <name>    Default target (T3CODE_MCP_DEFAULT_SERVER)
--allow-tools <list>       Comma-separated names/globs (T3CODE_MCP_ALLOW_TOOLS)
--deny-tools <list>        Comma-separated names/globs (T3CODE_MCP_DENY_TOOLS)
--read-only               Expose read-only tools (T3CODE_MCP_READ_ONLY=1)

Precedence: flags > environment > config file > shared t3c profiles.
`;
async function main() {
  let parsed;
  try {
    parsed = NodeUtil.parseArgs({
      allowPositionals: true,
      options: {
        config: { type: "string" },
        server: { type: "string", multiple: true },
        "default-server": { type: "string" },
        "allow-tools": { type: "string" },
        "deny-tools": { type: "string" },
        "read-only": { type: "boolean" },
        token: { type: "string" },
        probe: { type: "boolean" },
        version: { type: "boolean" },
        help: { type: "boolean" },
      },
    });
  } catch {
    throw new Error("Invalid arguments; use --help.");
  }
  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }
  const [command = "serve", ...rest] = positionals;
  if (command === "pair") {
    if (rest.length !== 2) throw new Error("pair requires a name and URL.");
    let token = values.token;
    if (token === undefined) {
      let input = "";
      for await (const part of process.stdin) input += part;
      token = input.trim();
    }
    if (!token) throw new Error("A pairing token is required on stdin or --token.");
    const profile = await new ProfileManager().pair({ name: rest[0]!, url: rest[1]! }, token);
    process.stdout.write(`${JSON.stringify({ server: profile.name, paired: true })}\n`);
    return;
  }
  if (!["serve", "servers", "tools"].includes(command) || rest.length)
    throw new Error("Unknown command; use --help.");
  const config = await loadConfig({
    ...(values.config === undefined ? {} : { config: values.config }),
    ...(values.server === undefined ? {} : { servers: values.server }),
    ...(values["default-server"] === undefined ? {} : { defaultServer: values["default-server"] }),
    ...(values["allow-tools"] === undefined
      ? {}
      : { allowTools: splitList(values["allow-tools"]) }),
    ...(values["deny-tools"] === undefined ? {} : { denyTools: splitList(values["deny-tools"]) }),
    ...(values["read-only"] === undefined ? {} : { readOnly: values["read-only"] }),
  });
  if (command === "tools") {
    process.stdout.write(
      `${JSON.stringify(allTools.filter((tool) => exposed(tool, config)).map((t) => t.name))}\n`,
    );
    return;
  }
  const registry = new ServerRegistry(config);
  if (command === "servers") {
    try {
      process.stdout.write(
        `${JSON.stringify(await allTools.find((t) => t.name === "server_list")!.run({ probe: values.probe ?? false }, { registry, signal: new AbortController().signal }))}\n`,
      );
    } finally {
      await registry.close();
    }
    return;
  }
  const server = createServer(registry);
  const transport = new StdioServerTransport();
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      await registry.close();
      await server.close();
    })());
  process.once("SIGTERM", () => {
    void close();
  });
  process.once("SIGINT", () => {
    void close();
  });
  await server.connect(transport);
}
void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error && !("code" in error) ? error.message : toToolError(error).message}\n`,
  );
  process.exitCode = 1;
});
