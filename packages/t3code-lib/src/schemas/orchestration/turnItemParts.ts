// ---
// relationships:
//   implements: library
// ---
/** The fields every turn item shares and the small records some of them carry. */
import { z } from "zod";
import { AuthMcpClientGrantedAccess } from "../auth.ts";
import {
  EnvironmentId,
  IsoDateTime,
  NodeId,
  NonNegativeInt,
  PositiveInt,
  ProviderThreadId,
  ProviderTurnId,
  RunId,
  ThreadId,
  TrimmedNonEmptyString,
  TurnItemId,
  forwardCompatibleLiteral,
} from "../common.ts";
import { OrchestrationV2ProviderRef } from "./model.ts";
import { ToolActivityIcon, ToolActivitySource, ToolActivitySurface } from "./providerRuntime.ts";

export const OrchestrationV2TurnItemStatus = forwardCompatibleLiteral([
  "idle",
  "pending",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export type OrchestrationV2TurnItemStatus = z.infer<typeof OrchestrationV2TurnItemStatus>;

/** Fields every turn item carries, whatever its `type`. */
export const OrchestrationV2TurnItemBaseFields = {
  toolNonExecutionKind: z.string().optional(),
  toolSurface: ToolActivitySurface.optional(),
  toolIcon: ToolActivityIcon.optional(),
  toolSource: ToolActivitySource.optional(),
  id: TurnItemId,
  threadId: ThreadId,
  runId: RunId.nullable(),
  nodeId: NodeId.nullable(),
  providerThreadId: ProviderThreadId.nullable(),
  providerTurnId: ProviderTurnId.nullable(),
  nativeItemRef: OrchestrationV2ProviderRef.nullable(),
  parentItemId: TurnItemId.nullable(),
  ordinal: NonNegativeInt,
  status: OrchestrationV2TurnItemStatus,
  title: z.string().nullable(),
  startedAt: IsoDateTime.nullable(),
  completedAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
} as const;
export const OrchestrationV2TurnItemBase = z.looseObject(OrchestrationV2TurnItemBaseFields);
export type OrchestrationV2TurnItemBase = z.infer<typeof OrchestrationV2TurnItemBase>;

/** One structured file operation reported by a provider inside a file_change item. */
export const OrchestrationV2FileChangeDetail = z.looseObject({
  operation: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
  oldPath: TrimmedNonEmptyString.optional(),
  fileType: TrimmedNonEmptyString.optional(),
  mimeType: TrimmedNonEmptyString.optional(),
});
export type OrchestrationV2FileChangeDetail = z.infer<typeof OrchestrationV2FileChangeDetail>;

export const OrchestrationV2FileSearchResult = z.looseObject({
  fileName: TrimmedNonEmptyString,
  line: PositiveInt.optional(),
  column: PositiveInt.optional(),
  preview: z.string().optional(),
});
export const OrchestrationV2WebSearchResult = z.looseObject({
  title: z.string().optional(),
  url: TrimmedNonEmptyString.optional(),
  snippet: z.string().optional(),
});

export const OrchestrationV2ProviderFailureClass = forwardCompatibleLiteral([
  "usage_limit",
  "provider_error",
  "transport_error",
  "permission_error",
  "validation_error",
  "unknown",
]);
export type OrchestrationV2ProviderFailureClass = z.infer<
  typeof OrchestrationV2ProviderFailureClass
>;
/** Transport-safe failure information; the server redacts credentials before building it. */
export const OrchestrationV2ProviderFailure = z.looseObject({
  class: OrchestrationV2ProviderFailureClass,
  message: TrimmedNonEmptyString.max(4_096),
  code: TrimmedNonEmptyString.max(128).nullable(),
  retryable: z.boolean().nullable(),
  resetAt: IsoDateTime.nullable().optional(),
});
export type OrchestrationV2ProviderFailure = z.infer<typeof OrchestrationV2ProviderFailure>;

export const OrchestrationV2ProviderRetry = z.looseObject({
  attempt: PositiveInt,
  maxAttempts: PositiveInt.nullable(),
  retryDelayMs: NonNegativeInt.nullable(),
});
export type OrchestrationV2ProviderRetry = z.infer<typeof OrchestrationV2ProviderRetry>;

export const OrchestrationV2SecretRequestStatus = forwardCompatibleLiteral([
  "pending",
  "saved",
  "declined",
  "cancelled",
]);
/**
 * An agent asked the user to link another environment. The pairing code never
 * passes through orchestration, so the item has only what was asked and how it ended.
 */
export const OrchestrationV2LinkRequestStatus = forwardCompatibleLiteral([
  "pending",
  "linked",
  "declined",
  "cancelled",
  "failed",
]);
export const OrchestrationV2LinkRequestFields = {
  type: z.literal("link_request"),
  /** The address the agent named, if it named one. */
  url: TrimmedNonEmptyString.optional(),
  reason: z.string(),
  /**
   * The environment the agent named. Without it or `url` the user picks the
   * machine. Beside a `url`, this and `label` are what answered at the address
   * on an older server: unauthenticated, so ignore both.
   */
  environmentId: EnvironmentId.optional(),
  /** Only from an older server, beside `url`; see `environmentId`. */
  label: z.string().optional(),
  /** A phrase from the user's words, such as "vps", that preselects a machine. */
  hint: z.string().optional(),
  /** The access the agent suggested; the user's choice is final. */
  requestedAccess: AuthMcpClientGrantedAccess.optional(),
  linkStatus: OrchestrationV2LinkRequestStatus,
  linkedEnvironmentId: EnvironmentId.optional(),
  linkedLabel: z.string().optional(),
  linkedAccess: AuthMcpClientGrantedAccess.optional(),
  failure: z.string().optional(),
} as const;
export const OrchestrationV2UserMessageInputIntent = forwardCompatibleLiteral([
  "turn_start",
  "queued_turn",
  "steer",
  "promoted_queued_to_steer",
]);
export type OrchestrationV2UserMessageInputIntent = z.infer<
  typeof OrchestrationV2UserMessageInputIntent
>;
