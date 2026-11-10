// ---
// relationships:
//   verifies: mcp
// ---
import type { McpServer } from "@modelcontextprotocol/server";
import { expect, it } from "vite-plus/test";
import { z } from "zod";
import type { ClientProvider } from "./clients.ts";
import { defineTool, type ToolAccess } from "./tool.ts";

function annotations(access?: ToolAccess | boolean): unknown {
  let seen: unknown;
  const server = {
    registerTool: (_name: string, config: { annotations: unknown }) => {
      seen = config.annotations;
    },
  } as unknown as McpServer;
  const run = async () => ({});
  const tool =
    access === undefined
      ? defineTool("sample", "Sample.", z.strictObject({}), run)
      : defineTool("sample", "Sample.", z.strictObject({}), run, access);
  tool.register(server, {} as ClientProvider);
  return seen;
}

const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
const destructive = { readOnlyHint: false, destructiveHint: true, idempotentHint: false };
const idempotentWrite = { readOnlyHint: false, destructiveHint: false, idempotentHint: true };

it.each([
  ["default", undefined, read],
  ["read", "read", read],
  ["true", true, read],
  ["destructive", "destructive", destructive],
  ["false", false, destructive],
  ["idempotentWrite", "idempotentWrite", idempotentWrite],
] as const)("maps access %s to its annotations", (_label, access, hints) => {
  expect(annotations(access)).toEqual({ ...hints, openWorldHint: true });
});
