// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { defineMethod } from "../spec.ts";
import {
  McpAppCallToolInput,
  McpAppCallToolResult,
  McpAppReadResourceInput,
  McpAppReadResourceResult,
  McpAppToolInfo,
  McpAppToolInfoInput,
  McpAppUpdateModelContextInput,
} from "../../schemas/mcpApps.ts";

export const mcpAppsMethods = {
  // An app's tool calls can change things on its server, like a user action.
  "mcpApps.callTool": defineMethod({
    payload: McpAppCallToolInput,
    success: McpAppCallToolResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "mcpApps.toolInfo": defineMethod({
    payload: McpAppToolInfoInput,
    success: McpAppToolInfo,
    stream: false,
    scope: "orchestration:read",
  }),
  "mcpApps.readResource": defineMethod({
    payload: McpAppReadResourceInput,
    success: McpAppReadResourceResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "mcpApps.updateModelContext": defineMethod({
    payload: McpAppUpdateModelContextInput,
    // Effect's JSON codec encodes Schema.Void as null; callers still receive void.
    success: z
      .null()
      .or(z.void())
      .transform((): void => undefined),
    stream: false,
    scope: "orchestration:operate",
  }),
} as const;
