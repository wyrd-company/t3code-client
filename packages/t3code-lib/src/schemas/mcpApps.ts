// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors `packages/contracts/src/mcpApps.ts`: requests an MCP App makes of
 * its own MCP server through the environment. Each names the tool call that
 * produced the app, so an app reaches only the server it came from.
 */
import { z } from "zod";
import { ThreadId, TrimmedNonEmptyString, TurnItemId } from "./common.ts";

const mcpAppTarget = { threadId: ThreadId, itemId: TurnItemId } as const;

export const McpAppCallToolInput = z.looseObject({
  ...mcpAppTarget,
  name: TrimmedNonEmptyString,
  arguments: z.record(z.string(), z.unknown()),
});
export type McpAppCallToolInput = z.infer<typeof McpAppCallToolInput>;

/** MCP `CallToolResult`, passed through unchanged. */
export const McpAppCallToolResult = z.looseObject({
  content: z.array(z.unknown()),
  structuredContent: z.unknown().optional(),
  isError: z.boolean().optional(),
  _meta: z.unknown().optional(),
});
export type McpAppCallToolResult = z.infer<typeof McpAppCallToolResult>;

export const McpAppToolInfoInput = z.looseObject({ ...mcpAppTarget, name: TrimmedNonEmptyString });
export type McpAppToolInfoInput = z.infer<typeof McpAppToolInfoInput>;

/** Whether the tool exists for apps and whether its server declares it read-only. */
export const McpAppToolInfo = z.looseObject({
  callable: z.boolean(),
  readOnly: z.boolean(),
  title: z.string().optional(),
  /** The server's MCP `Tool` definition. */
  tool: z.unknown().optional(),
});
export type McpAppToolInfo = z.infer<typeof McpAppToolInfo>;

export const McpAppReadResourceInput = z.looseObject({
  ...mcpAppTarget,
  uri: TrimmedNonEmptyString,
});
export type McpAppReadResourceInput = z.infer<typeof McpAppReadResourceInput>;

/** MCP `ReadResourceResult`, passed through unchanged. */
export const McpAppReadResourceResult = z.looseObject({ contents: z.array(z.unknown()) });
export type McpAppReadResourceResult = z.infer<typeof McpAppReadResourceResult>;

/**
 * What an app wants the agent to know on its next turn. Each update replaces
 * the app's previous one; no content clears it.
 */
export const McpAppUpdateModelContextInput = z.looseObject({
  ...mcpAppTarget,
  /** The thread whose next turn gets the context: the app's own thread or a fork that shows it. */
  conversationThreadId: ThreadId,
  content: z.array(z.unknown()).optional(),
  structuredContent: z.record(z.string(), z.unknown()).optional(),
});
export type McpAppUpdateModelContextInput = z.infer<typeof McpAppUpdateModelContextInput>;
