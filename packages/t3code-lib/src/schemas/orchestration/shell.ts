// ---
// relationships:
//   implements: library
// ---
/** The lightweight cross-thread view: project and thread shells, their snapshot, and its stream. */
import { z } from "zod";
import {
  CommandId,
  IsoDateTime,
  MessageId,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  ProviderInstanceId,
  ProviderThreadId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "../common.ts";
import { ProjectFaviconPath, ProjectScript, ReceivedProjectIcon } from "../projects.ts";
import { RepositoryIdentity, ThreadEnvMode } from "../environment.ts";
import {
  ModelSelection,
  OrchestrationV2CreationFields,
  OrchestrationV2ThreadHistoryOrigin,
  ProviderInteractionMode,
  RuntimeMode,
} from "./model.ts";
import { OrchestrationV2MessageRole } from "./messages.ts";
import {
  OrchestrationV2PendingBackgroundTask,
  OrchestrationV2ProviderGoal,
  OrchestrationV2RuntimeRequestKind,
} from "./providerState.ts";
import { ThreadLinkedPullRequest, ThreadPullRequestLink } from "./pullRequest.ts";
import {
  OrchestrationV2AppThreadLineage,
  OrchestrationV2LimitRecovery,
  OrchestrationV2ThreadForkedFrom,
  ThreadTitleRegeneration,
} from "./thread.ts";
import { OrchestrationV2ProviderFailureClass } from "./turnItemParts.ts";

/** Project summary shared by the shell and the application project APIs. */
export const OrchestrationProjectShell = z.looseObject({
  id: ProjectId,
  title: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
  repositoryIdentity: RepositoryIdentity.nullable().optional(),
  defaultModelSelection: ModelSelection.nullable(),
  defaultThreadEnvMode: ThreadEnvMode.nullable().optional(),
  autoPull: z.boolean().optional(),
  faviconPath: ProjectFaviconPath.nullable().optional(),
  projectIcon: ReceivedProjectIcon.nullable().optional(),
  scripts: z.array(ProjectScript),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type OrchestrationProjectShell = z.infer<typeof OrchestrationProjectShell>;

/** `idle` when the thread has no run; otherwise the latest run's status. */
export const OrchestrationV2ShellThreadStatus = forwardCompatibleLiteral([
  "idle",
  "preparing",
  "queued",
  "starting",
  "running",
  "waiting",
  "completed",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
]);
export type OrchestrationV2ShellThreadStatus = z.infer<typeof OrchestrationV2ShellThreadStatus>;

export const OrchestrationV2PendingRuntimeRequestSummary = z.looseObject({
  id: RuntimeRequestId,
  kind: OrchestrationV2RuntimeRequestKind,
  createdAt: IsoDateTime,
});
export type OrchestrationV2PendingRuntimeRequestSummary = z.infer<
  typeof OrchestrationV2PendingRuntimeRequestSummary
>;
export const OrchestrationV2LatestVisibleMessageSummary = z.looseObject({
  id: MessageId,
  role: OrchestrationV2MessageRole,
  text: z.string(),
  updatedAt: IsoDateTime,
});
export type OrchestrationV2LatestVisibleMessageSummary = z.infer<
  typeof OrchestrationV2LatestVisibleMessageSummary
>;

export const OrchestrationV2ThreadShell = z.looseObject({
  ...OrchestrationV2CreationFields,
  id: ThreadId,
  projectId: ProjectId,
  title: z.string(),
  providerInstanceId: ProviderInstanceId,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  branch: TrimmedNonEmptyString.nullable(),
  worktreePath: TrimmedNonEmptyString.nullable(),
  linkedPullRequest: ThreadLinkedPullRequest.nullable().optional(),
  pullRequests: z.array(ThreadPullRequestLink).optional(),
  branchPullRequest: ThreadLinkedPullRequest.nullable().optional(),
  lineage: OrchestrationV2AppThreadLineage,
  forkedFrom: OrchestrationV2ThreadForkedFrom.nullable(),
  activeProviderThreadId: ProviderThreadId.nullable(),
  historyOrigin: OrchestrationV2ThreadHistoryOrigin.optional(),
  latestRunId: RunId.nullable(),
  latestRunRequestedAt: IsoDateTime.nullable().optional(),
  latestRunStartedAt: IsoDateTime.nullable().optional(),
  latestRunCompletedAt: IsoDateTime.nullable().optional(),
  activeRunId: RunId.nullable(),
  activityRunStartedAt: IsoDateTime.nullable().optional(),
  activityRunStatus: forwardCompatibleLiteral(["preparing", "starting", "running", "waiting"])
    .nullable()
    .optional(),
  status: OrchestrationV2ShellThreadStatus,
  lastError: z.string().nullable().optional(),
  lastErrorClass: OrchestrationV2ProviderFailureClass.nullable().optional(),
  usageLimitResetAt: IsoDateTime.nullable().optional(),
  pendingRuntimeRequest: OrchestrationV2PendingRuntimeRequestSummary.nullable(),
  latestVisibleMessage: OrchestrationV2LatestVisibleMessageSummary.nullable(),
  latestUserMessageAt: IsoDateTime.nullable(),
  latestUserAuthoredMessageAt: IsoDateTime.nullable().optional(),
  hasActionableProposedPlan: z.boolean(),
  pendingBackgroundTasks: z.array(OrchestrationV2PendingBackgroundTask).default([]),
  providerInstanceHistory: z.array(ProviderInstanceId).default([]),
  goal: OrchestrationV2ProviderGoal.nullable().optional(),
  itemCount: NonNegativeInt,
  visibleItemCount: NonNegativeInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  archivedAt: IsoDateTime.nullable(),
  settledOverride: forwardCompatibleLiteral(["settled", "active"]).nullable(),
  settledAt: IsoDateTime.nullable(),
  unsettledAt: IsoDateTime.nullable().optional(),
  snoozedUntil: IsoDateTime.nullable().optional(),
  snoozedAt: IsoDateTime.nullable().optional(),
  /** Manual wakes restart inactivity without changing the sidebar's sort position. */
  lastSnoozeWakeAt: IsoDateTime.nullable().optional(),
  limitRecovery: OrchestrationV2LimitRecovery.nullable().optional(),
  pinnedAt: IsoDateTime.nullable().optional(),
  autoSettleDisabledAt: IsoDateTime.nullable().optional(),
  pinOrderKey: TrimmedNonEmptyString.nullable().optional(),
  activeOrderKey: TrimmedNonEmptyString.nullable().optional(),
  lastVisitedAt: IsoDateTime.nullable().optional(),
  titleRegeneration: ThreadTitleRegeneration.nullable().optional(),
  deletedAt: IsoDateTime.nullable(),
});
export type OrchestrationV2ThreadShell = z.infer<typeof OrchestrationV2ThreadShell>;

export const OrchestrationV2ThreadShellSnapshot = z.looseObject({
  schemaVersion: PositiveInt,
  snapshotSequence: NonNegativeInt,
  threads: z.array(OrchestrationV2ThreadShell),
  archivedThreads: z.array(OrchestrationV2ThreadShell),
});
export const OrchestrationV2ShellSnapshot = z.looseObject({
  ...OrchestrationV2ThreadShellSnapshot.shape,
  projects: z.array(OrchestrationProjectShell),
});
export type OrchestrationV2ShellSnapshot = z.infer<typeof OrchestrationV2ShellSnapshot>;

export const OrchestrationV2ShellStreamItem = taggedUnionWithUnknown("kind", [
  z.looseObject({ kind: z.literal("synchronized") }),
  z.looseObject({
    kind: z.literal("snapshot"),
    snapshot: OrchestrationV2ShellSnapshot,
    resolvedRepositoryIdentityRoots: z.array(z.string()).optional(),
  }),
  z.looseObject({
    kind: z.literal("project.updated"),
    sequence: NonNegativeInt,
    project: OrchestrationProjectShell,
  }),
  z.looseObject({
    kind: z.literal("project.removed"),
    sequence: NonNegativeInt,
    projectId: ProjectId,
  }),
  z.looseObject({
    kind: z.literal("thread.updated"),
    sequence: NonNegativeInt,
    location: forwardCompatibleLiteral(["active", "archive"]),
    thread: OrchestrationV2ThreadShell,
  }),
  z.looseObject({
    kind: z.literal("thread.removed"),
    sequence: NonNegativeInt,
    location: forwardCompatibleLiteral(["active", "archive"]),
    threadId: ThreadId,
  }),
]);
export type OrchestrationV2ShellStreamItem = z.infer<typeof OrchestrationV2ShellStreamItem>;

export const OrchestrationV2SubscribeShellInput = z.looseObject({
  /** Skip the initial snapshot and replay shell events after this sequence. */
  afterSequence: NonNegativeInt.optional(),
  /** Requests a `synchronized` marker between catch-up and live delivery. */
  requestCompletionMarker: z.boolean().optional(),
});
export type OrchestrationV2SubscribeShellInput = z.infer<typeof OrchestrationV2SubscribeShellInput>;

export const OrchestrationV2ArchivedShellSnapshot = z.looseObject({
  schemaVersion: PositiveInt,
  snapshotSequence: NonNegativeInt,
  projects: z.array(OrchestrationProjectShell),
  threads: z.array(OrchestrationV2ThreadShell),
});
export type OrchestrationV2ArchivedShellSnapshot = z.infer<
  typeof OrchestrationV2ArchivedShellSnapshot
>;
export const OrchestrationV2ArchivedShellStreamItem = taggedUnionWithUnknown("kind", [
  z.looseObject({ kind: z.literal("snapshot"), snapshot: OrchestrationV2ArchivedShellSnapshot }),
  z.looseObject({
    kind: z.literal("thread.updated"),
    sequence: NonNegativeInt,
    thread: OrchestrationV2ThreadShell,
  }),
  z.looseObject({
    kind: z.literal("thread.removed"),
    sequence: NonNegativeInt,
    threadId: ThreadId,
  }),
]);
export type OrchestrationV2ArchivedShellStreamItem = z.infer<
  typeof OrchestrationV2ArchivedShellStreamItem
>;

/** The `commandId` stamp on a `thread.visit` and the like; re-exported for facades. */
export type { CommandId };
