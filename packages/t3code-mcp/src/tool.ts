// ---
// relationships:
//   implements: mcp
// ---
import type { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import type { T3Client } from "@wyrd-company/t3code-lib";
import { z } from "zod";
import type { ClientProvider } from "./clients.ts";
import { safeError } from "./errors.ts";

export interface ToolRegistration {
  readonly name: string;
  register(server: McpServer, clients: ClientProvider): void;
}

/**
 * Each registration retains its own schema and typed callback. `readOnly`
 * false marks a destructive write; "idempotentWrite" marks a write that is
 * neither destructive nor different when repeated.
 */
export function defineTool<Shape extends z.ZodRawShape>(
  name: string,
  description: string,
  input: z.ZodObject<Shape>,
  run: (
    args: z.output<z.ZodObject<Shape>>,
    client: T3Client,
    signal: AbortSignal,
  ) => Promise<unknown>,
  readOnly: boolean | "idempotentWrite" = true,
): ToolRegistration {
  const idempotentWrite = readOnly === "idempotentWrite";
  return {
    name,
    register(server, clients) {
      server.registerTool(
        name,
        {
          description,
          inputSchema: input,
          annotations: {
            readOnlyHint: readOnly === true,
            destructiveHint: readOnly === false,
            idempotentHint: readOnly === true || idempotentWrite,
            openWorldHint: true,
          },
        },
        async (args, context) => {
          try {
            const signal = context.mcpReq.signal;
            const client = await clients.get(signal);
            return jsonResult(await run(input.parse(args), client, signal));
          } catch (error) {
            return jsonResult({ error: safeError(error) }, true);
          }
        },
      );
    },
  };
}

export function jsonResult(value: unknown, isError = false): CallToolResult {
  const object =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { data: value ?? null };
  return {
    content: [{ type: "text", text: JSON.stringify(object) }],
    structuredContent: object,
    ...(isError ? { isError: true } : {}),
  };
}
