// ---
// relationships:
//   implements: library
// ---
/** How a launch prepares a run's workspace, and the same strategy as a run records it. */
import { z } from "zod";
import { GitRefName, TrimmedNonEmptyString, taggedUnionWithUnknown } from "../common.ts";
import { PROJECT_TRACKED_FOLDERS_MAX } from "../projectTrackedFolders.ts";

const workspaceStrategyMembers = [
  z.looseObject({ type: z.literal("root"), branch: GitRefName.optional() }),
  z.looseObject({
    type: z.literal("existing_worktree"),
    worktreePath: TrimmedNonEmptyString,
    branch: GitRefName.optional(),
  }),
  z.looseObject({
    type: z.literal("worktree"),
    baseRef: GitRefName,
    branch: GitRefName.optional(),
    startFromOrigin: z.boolean().optional(),
    /** Tracked Git folders to give the worktree. Default: all, or none above eight. */
    repositories: z
      .array(z.looseObject({ path: TrimmedNonEmptyString }))
      .max(PROJECT_TRACKED_FOLDERS_MAX)
      .optional(),
  }),
] as const;
/** How a launch prepares a run's workspace; strict because callers send it. */
export const OrchestrationV2ThreadLaunchWorkspaceStrategy = z.discriminatedUnion(
  "type",
  workspaceStrategyMembers,
);
export type OrchestrationV2ThreadLaunchWorkspaceStrategy = z.infer<
  typeof OrchestrationV2ThreadLaunchWorkspaceStrategy
>;
/** The same strategy as a run records it; a newer kind decodes as unknown. */
export const OrchestrationV2WorkspacePreparation = taggedUnionWithUnknown(
  "type",
  workspaceStrategyMembers,
);
export type OrchestrationV2WorkspacePreparation = z.infer<
  typeof OrchestrationV2WorkspacePreparation
>;
/** Failure code on the error item a failed workspace preparation leaves. */
export const ORCHESTRATION_V2_WORKSPACE_PREPARATION_FAILURE_CODE = "workspace_preparation_failed";
