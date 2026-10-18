// ---
// relationships:
//   implements: mcp
// ---
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import * as NodeModule from "node:module";
import type { Registry } from "./servers/registry.ts";
import { exposed } from "./policy/policy.ts";
import { discoveryTools } from "./tools/discovery.ts";
import { readTools } from "./tools/reads.ts";
import { dispatchTools } from "./tools/dispatch.ts";
import { controlTools } from "./tools/control.ts";
import { waitTools } from "./tools/wait.ts";
export const SERVER_VERSION = (
  NodeModule.createRequire(import.meta.url)("../package.json") as { version: string }
).version;
export const allTools = [
  ...discoveryTools,
  ...readTools,
  ...dispatchTools,
  ...controlTools,
  ...waitTools,
];
export const INSTRUCTIONS =
  "Dispatch and communicate with threads on other T3 Code servers. Flow: server_list → server_capabilities → thread_launch → thread_wait → thread_read / pending_request_respond / thread_send. Name a server on each call when several are configured. Use explicit modelSelection from capabilities and retain clientRequestId for launch retries. A wait timeout leaves work running: wait again. A pending request satisfies a wait; answer it and wait again. Sends are not idempotent; read before retrying after a lost response.";
export function jsonResult(value: object, isError = false): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
    ...(isError ? { isError: true } : {}),
  };
}
/** Session closure releases every lazy upstream client. */
export function createServer(registry: Registry): McpServer {
  const server = new McpServer(
    { name: "t3code-mcp", version: SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );
  // The SDK exposes a callback property, not an EventTarget.
  // oxlint-disable-next-line unicorn/prefer-add-event-listener
  server.server.onclose = () => {
    void registry.close().catch(() => {
      process.stderr.write("Could not close an upstream client.\n");
    });
  };
  for (const tool of allTools.filter((tool) => exposed(tool, registry.config))) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input,
        annotations: { readOnlyHint: tool.readOnly, openWorldHint: true },
      },
      async (args, context) => {
        try {
          const token = context.mcpReq._meta?.progressToken;
          return jsonResult(
            await tool.run(args, {
              registry,
              signal: context.mcpReq.signal,
              ...(token === undefined
                ? {}
                : {
                    progress: (elapsedMs: number) =>
                      context.mcpReq.notify({
                        method: "notifications/progress",
                        params: {
                          progressToken: token,
                          progress: elapsedMs / 1000,
                          message: "Waiting for threads to report done.",
                        },
                      }),
                  }),
            }),
          );
        } catch (error) {
          const failure = await registry.error(error);
          return jsonResult({ error: { code: failure.code, message: failure.message } }, true);
        }
      },
    );
  }
  return server;
}
