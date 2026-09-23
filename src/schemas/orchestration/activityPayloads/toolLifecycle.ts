/**
 * Payloads of `tool.started`, `tool.updated`, and `tool.completed`, after the
 * server's `projectActivityPayload`. The projection replaces the provider's
 * raw `data` with a slim summary; an MCP tool call is summarised differently
 * from every other tool, so the payload is split on `itemType`.
 */
import { z } from "zod";
import { TrimmedNonEmptyString, forwardCompatibleLiteral } from "../../common.ts";
import {
  RuntimeItemId,
  RuntimeItemStatus,
  TOOL_LIFECYCLE_ITEM_TYPES,
  ToolActivityIcon,
  ToolActivitySource,
  ToolActivitySurface,
} from "./providerRuntime.ts";

/** A one-line preview, or `"N lines"`, of a tool's text output. */
const ToolOutputSummary = z.looseObject({ content: z.string() });

/** A file the projection found under a path-like key anywhere in the raw data. */
export const ToolChangedFile = z.looseObject({ path: TrimmedNonEmptyString });
export type ToolChangedFile = z.infer<typeof ToolChangedFile>;

/** Question text of a native ask-the-user tool; choices and answers live on the user-input activities. */
export const QuestionToolInput = z.looseObject({
  questions: z.array(z.looseObject({ question: TrimmedNonEmptyString.nullable() })),
});
export type QuestionToolInput = z.infer<typeof QuestionToolInput>;

export const ToolRawOutputSummary = z.union([
  z.looseObject({ totalFiles: z.number(), truncated: z.literal(true).optional() }),
  ToolOutputSummary,
]);
export type ToolRawOutputSummary = z.infer<typeof ToolRawOutputSummary>;

const projectedDataCommonFields = {
  files: z.array(ToolChangedFile).optional(),
  // Copied verbatim from the provider's raw tool data.
  toolCallId: z.unknown().optional(),
  // Copied verbatim from the provider's raw tool data.
  kind: z.unknown().optional(),
  // Copied verbatim from the provider's raw tool data, or the ask-the-user tool's name.
  toolName: z.unknown().optional(),
} as const;

/** `data.item` of a command-like tool, reduced to its command and output previews. */
export const ProjectedCommandItem = z.looseObject({
  // Copied verbatim from the provider's raw item.
  command: z.unknown().optional(),
  aggregatedOutput: z.string().optional(),
  // `command` is copied verbatim from the provider's raw item input.
  input: z.looseObject({ command: z.unknown() }).optional(),
  result: z
    .looseObject({
      // Copied verbatim from the provider's raw item result.
      command: z.unknown().optional(),
      content: z.string().optional(),
    })
    .optional(),
});
export type ProjectedCommandItem = z.infer<typeof ProjectedCommandItem>;

/** `data` of every tool other than an MCP tool call. */
export const ProjectedToolData = z.looseObject({
  ...projectedDataCommonFields,
  item: ProjectedCommandItem.optional(),
  // Copied verbatim from the provider's raw tool data.
  command: z.unknown().optional(),
  imagePath: TrimmedNonEmptyString.optional(),
  input: QuestionToolInput.optional(),
  rawOutput: ToolRawOutputSummary.optional(),
});
export type ProjectedToolData = z.infer<typeof ProjectedToolData>;

/** `data.item` of an MCP tool call: the fields clients render, with the result summarised. */
export const ProjectedMcpItem = z.looseObject({
  // The item fields below are copied verbatim from the provider's raw MCP item.
  type: z.unknown().optional(),
  id: z.unknown().optional(),
  tool: z.unknown().optional(),
  server: z.unknown().optional(),
  status: z.unknown().optional(),
  arguments: z.unknown().optional(),
  appContext: z.unknown().optional(),
  error: z.unknown().optional(),
  durationMs: z.unknown().optional(),
  result: ToolOutputSummary.optional(),
});
export type ProjectedMcpItem = z.infer<typeof ProjectedMcpItem>;

/** `data` of an MCP tool call. */
export const ProjectedMcpToolData = z.looseObject({
  ...projectedDataCommonFields,
  item: ProjectedMcpItem.optional(),
  // The provider's raw tool input, or `QuestionToolInput` for an ask-the-user tool.
  input: z.unknown().optional(),
  result: ToolOutputSummary.optional(),
});
export type ProjectedMcpToolData = z.infer<typeof ProjectedMcpToolData>;

const toolLifecycleFields = {
  toolCallId: RuntimeItemId.optional(),
  status: RuntimeItemStatus.optional(),
  title: TrimmedNonEmptyString.optional(),
  detail: TrimmedNonEmptyString.optional(),
  toolSurface: ToolActivitySurface.optional(),
  toolIcon: ToolActivityIcon.optional(),
  toolSource: ToolActivitySource.optional(),
  agentId: TrimmedNonEmptyString.optional(),
  parentToolUseId: TrimmedNonEmptyString.optional(),
} as const;

export const McpToolActivityPayload = z.looseObject({
  itemType: z.literal("mcp_tool_call"),
  ...toolLifecycleFields,
  data: ProjectedMcpToolData.optional(),
});
export type McpToolActivityPayload = z.infer<typeof McpToolActivityPayload>;

/** Every tool item type except `mcp_tool_call`; the server projects all of them alike. */
export const GenericToolItemType = forwardCompatibleLiteral([
  "command_execution",
  "file_change",
  "dynamic_tool_call",
  "collab_agent_tool_call",
  "web_search",
  "image_view",
] as const satisfies readonly Exclude<
  (typeof TOOL_LIFECYCLE_ITEM_TYPES)[number],
  "mcp_tool_call"
>[]);
export type GenericToolItemType = z.infer<typeof GenericToolItemType>;

export const GenericToolActivityPayload = z.looseObject({
  itemType: GenericToolItemType.refine((itemType) => itemType !== "mcp_tool_call"),
  ...toolLifecycleFields,
  data: ProjectedToolData.optional(),
});
export type GenericToolActivityPayload = z.infer<typeof GenericToolActivityPayload>;

/** A tool lifecycle payload. Narrow on `itemType === "mcp_tool_call"` to read MCP data. */
export const ToolActivityPayload = z.union([McpToolActivityPayload, GenericToolActivityPayload]);
export type ToolActivityPayload = z.infer<typeof ToolActivityPayload>;

export const ToolStartedActivityPayload = ToolActivityPayload;
export type ToolStartedActivityPayload = z.infer<typeof ToolStartedActivityPayload>;
export const ToolUpdatedActivityPayload = ToolActivityPayload;
export type ToolUpdatedActivityPayload = z.infer<typeof ToolUpdatedActivityPayload>;
export const ToolCompletedActivityPayload = ToolActivityPayload;
export type ToolCompletedActivityPayload = z.infer<typeof ToolCompletedActivityPayload>;
