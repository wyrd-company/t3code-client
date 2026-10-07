/** What a provider session can do; mirrors `OrchestrationV2ProviderCapabilities`. */
import { z } from "zod";
import { PositiveInt, forwardCompatibleLiteral } from "../common.ts";

export const OrchestrationV2SessionCapabilities = z.looseObject({
  supportsMultipleProviderThreadsPerSession: z.boolean(),
  supportsModelSwitchInSession: z.boolean(),
  supportsProviderSwitchingViaHandoff: z.boolean(),
  supportsRuntimeModeSwitchInSession: z.boolean(),
  pendingRequestsSurviveRestart: z.boolean(),
});
export const OrchestrationV2ThreadCapabilities = z.looseObject({
  canCreateEmptyThread: z.boolean(),
  canReadThreadSnapshot: z.boolean(),
  canRollbackThread: z.boolean(),
  canForkThread: z.boolean(),
  canForkFromTurn: z.boolean(),
  canForkFromSubagentThread: z.boolean(),
  exposesNativeThreadId: z.boolean(),
});
export const OrchestrationV2TurnCapabilities = z.looseObject({
  exposesNativeTurnId: z.boolean(),
  emitsTurnStarted: z.boolean(),
  emitsTurnCompleted: z.boolean(),
  supportsInterrupt: z.boolean(),
  supportsActiveSteering: z.boolean(),
  activeSteeringInterruptsTools: z.boolean().optional(),
  supportsSteeringByInterruptRestart: z.boolean(),
  supportsQueuedMessages: z.boolean(),
  terminalStatusQuality: forwardCompatibleLiteral(["strong", "weak", "none"]),
});
export const OrchestrationV2StreamingCapabilities = z.looseObject({
  streamsAssistantText: z.boolean(),
  streamsReasoning: z.boolean(),
  streamsToolOutput: z.boolean(),
  streamsPlanText: z.boolean(),
  emitsMessageCompleted: z.boolean(),
});
export const OrchestrationV2ToolCapabilities = z.looseObject({
  exposesToolItemIds: z.boolean(),
  emitsToolStarted: z.boolean(),
  emitsToolCompleted: z.boolean(),
  emitsToolOutput: z.boolean(),
  supportsMcpTools: z.boolean(),
  supportsDynamicToolCallbacks: z.boolean(),
});
export const OrchestrationV2ApprovalCapabilities = z.looseObject({
  supportsCommandApproval: z.boolean(),
  supportsFileReadApproval: z.boolean(),
  supportsFileChangeApproval: z.boolean(),
  supportsApplyPatchApproval: z.boolean(),
  approvalsHaveNativeRequestIds: z.boolean(),
  approvalCallbacksAreLiveOnly: z.boolean(),
  approvalsCanOriginateFromSubagents: z.boolean(),
});
export const OrchestrationV2PlanningCapabilities = z.looseObject({
  emitsPlanUpdated: z.boolean(),
  emitsTodoList: z.boolean(),
  emitsProposedPlan: z.boolean(),
  supportsStructuredQuestions: z.boolean(),
  planDeltasHaveItemIds: z.boolean(),
});
export const OrchestrationV2SubagentCapabilities = z.looseObject({
  supportsSubagents: z.boolean(),
  exposesSubagentThreadIds: z.boolean(),
  emitsSubagentLifecycle: z.boolean(),
  canWaitForSubagents: z.boolean(),
  canCloseSubagents: z.boolean(),
  canForkSubagentThread: z.boolean(),
});
export const OrchestrationV2ContextCapabilities = z.looseObject({
  acceptsSystemContext: z.boolean(),
  acceptsDeveloperContext: z.boolean(),
  acceptsSyntheticUserContext: z.boolean(),
  canGenerateSummaries: z.boolean(),
  canConsumeHandoffSummaries: z.boolean(),
  supportsDeltaHandoff: z.boolean(),
  supportsFullThreadHandoff: z.boolean(),
  maxRecommendedHandoffChars: PositiveInt.nullable(),
});
export const OrchestrationV2CheckpointCapabilities = z.looseObject({
  appCanCheckpointFilesystem: z.boolean(),
  supportsNestedCheckpointScopes: z.boolean(),
  providerCanRollbackConversation: z.boolean(),
  providerRollbackReturnsSnapshot: z.boolean(),
  providerCanReadConversationSnapshot: z.boolean(),
});
/** Where runtime modes are enforced; absent records decode to the weaker guarantee. */
export const OrchestrationV2RuntimePolicyCapabilities = z.looseObject({
  enforcement: forwardCompatibleLiteral(["native", "client-boundary"]),
});
export const OrchestrationV2IdentityCapabilities = z.looseObject({
  nativeThreadIds: forwardCompatibleLiteral(["strong", "weak", "none"]),
  nativeTurnIds: forwardCompatibleLiteral(["strong", "weak", "none"]),
  nativeItemIds: forwardCompatibleLiteral(["strong", "weak", "none"]),
  nativeRequestIds: forwardCompatibleLiteral(["strong", "weak", "none"]),
});

export const OrchestrationV2ProviderCapabilities = z.looseObject({
  sessions: OrchestrationV2SessionCapabilities,
  threads: OrchestrationV2ThreadCapabilities,
  turns: OrchestrationV2TurnCapabilities,
  streaming: OrchestrationV2StreamingCapabilities,
  tools: OrchestrationV2ToolCapabilities,
  approvals: OrchestrationV2ApprovalCapabilities,
  planning: OrchestrationV2PlanningCapabilities,
  subagents: OrchestrationV2SubagentCapabilities,
  context: OrchestrationV2ContextCapabilities,
  checkpointing: OrchestrationV2CheckpointCapabilities,
  identity: OrchestrationV2IdentityCapabilities,
  runtimePolicy: OrchestrationV2RuntimePolicyCapabilities.default({
    enforcement: "client-boundary",
  }),
});
export type OrchestrationV2ProviderCapabilities = z.infer<
  typeof OrchestrationV2ProviderCapabilities
>;
