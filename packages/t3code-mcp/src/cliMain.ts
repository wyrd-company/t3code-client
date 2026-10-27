// ---
// relationships:
//   implements: mcp
// ---
import { parseArgs } from "node:util";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { SharedClient, type ConnectionOptions } from "./clients.ts";
import { createServer, serverVersion } from "./server.ts";
import { toolNames } from "./tools/index.ts";

const help = `Usage: t3code-mcp [serve] [--profile NAME | --server URL --credentials FILE]
       t3code-mcp tools
       t3code-mcp --version

Serve complementary T3 Code tools over stdio. Uses t3c profiles and credentials.
Pair and manage credentials with t3c. Stdout is reserved for MCP protocol.
`;

export function main(args: string[]): void {
  let values: {
    profile?: string;
    server?: string;
    credentials?: string;
    help?: boolean;
    version?: boolean;
  };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        profile: { type: "string" },
        server: { type: "string" },
        credentials: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "V" },
      },
    }));
    if (
      positionals.length > 1 ||
      (positionals[0] !== undefined && !["serve", "tools"].includes(positionals[0]))
    )
      throw new Error();
    if (
      values.profile !== undefined &&
      (values.server !== undefined || values.credentials !== undefined)
    )
      throw new Error();
  } catch {
    process.stderr.write("Invalid arguments. Use t3code-mcp --help.\n");
    process.exitCode = 2;
    return;
  }
  if (values.help) {
    process.stdout.write(help);
    return;
  }
  if (values.version) {
    process.stdout.write(`${serverVersion}\n`);
    return;
  }
  if (positionals[0] === "tools") {
    process.stdout.write(`${JSON.stringify({ tools: toolNames })}\n`);
    return;
  }
  const options: ConnectionOptions = {
    ...(values.profile === undefined ? {} : { profile: values.profile }),
    ...(values.server === undefined ? {} : { server: values.server }),
    ...(values.credentials === undefined ? {} : { credentialsFile: values.credentials }),
  };
  try {
    const clients = new SharedClient(options);
    const handle = serveStdio(() => createServer(clients));
    const stop = () => {
      void handle
        .close()
        .then(() => clients.close())
        .catch(() => {
          process.stderr.write("Could not close the MCP server.\n");
          process.exitCode = 1;
        });
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch {
    process.stderr.write("Could not start the MCP server. Check connection selections.\n");
    process.exitCode = 2;
  }
}
