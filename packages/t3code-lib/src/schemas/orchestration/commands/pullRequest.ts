// ---
// relationships:
//   implements: library
// ---
/** Pull-request link commands of `OrchestrationV2Command`. */
import { z } from "zod";
import {
  CommandId,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "../../common.ts";
import {
  ThreadLinkedPullRequest,
  ThreadPullRequestKey,
  ThreadPullRequestLinkSource,
  ThreadPullRequestSnapshot,
  ThreadPullRequestStack,
} from "../pullRequest.ts";

const stamped = { commandId: CommandId, threadId: ThreadId } as const;

export const ThreadPullRequestLinkCommand = z.looseObject({
  type: z.literal("thread.pull-request.link"),
  ...stamped,
  ...ThreadPullRequestKey.shape,
  url: TrimmedNonEmptyString,
  source: ThreadPullRequestLinkSource,
  repositoryWebUrl: TrimmedNonEmptyString.optional(),
});
export const ThreadPullRequestUnlinkCommand = z.looseObject({
  type: z.literal("thread.pull-request.unlink"),
  ...stamped,
  ...ThreadPullRequestKey.shape,
});
export const ThreadPullRequestLinkSyncCommand = z.looseObject({
  type: z.literal("thread.pull-request-link.sync"),
  ...stamped,
  ...ThreadPullRequestKey.shape,
  snapshot: ThreadPullRequestSnapshot,
  stack: ThreadPullRequestStack.nullable(),
});
/** Start or stop the server watching a linked pull request for this thread's agent. */
export const ThreadPullRequestWatchCommand = z.looseObject({
  type: z.literal("thread.pull-request.watch"),
  ...stamped,
  ...ThreadPullRequestKey.shape,
  watching: z.boolean(),
  link: z
    .looseObject({
      url: TrimmedNonEmptyString,
      source: ThreadPullRequestLinkSource,
      repositoryWebUrl: TrimmedNonEmptyString.optional(),
    })
    .optional(),
});
export const ThreadPullRequestSyncCommand = z.looseObject({
  type: z.literal("thread.pull-request.sync"),
  ...stamped,
  projectId: ProjectId,
  snapshotSequence: NonNegativeInt,
  expected: z.looseObject({
    workspaceRoot: TrimmedNonEmptyString,
    branch: TrimmedNonEmptyString.nullable(),
    worktreePath: TrimmedNonEmptyString.nullable(),
    linkedPullRequest: ThreadLinkedPullRequest.nullable(),
    branchPullRequest: ThreadLinkedPullRequest.nullable(),
  }),
  branchPullRequest: ThreadLinkedPullRequest.nullable(),
  linkedPullRequest: ThreadLinkedPullRequest.optional(),
});

export const pullRequestCommandMembers = [
  ThreadPullRequestLinkCommand,
  ThreadPullRequestUnlinkCommand,
  ThreadPullRequestLinkSyncCommand,
  ThreadPullRequestWatchCommand,
  ThreadPullRequestSyncCommand,
] as const;
