import { z } from "zod";
import { CommandId, ProjectId, ThreadId, TrimmedNonEmptyString } from "../../common.ts";
import { ThreadIssueKey, ThreadIssueLinkSource } from "../../threadIssues.ts";

const issueCommandFields = {
  commandId: CommandId,
  threadId: ThreadId,
  ...ThreadIssueKey.shape,
};

export const ThreadIssueLinkCommand = z.looseObject({
  type: z.literal("thread.issue.link"),
  ...issueCommandFields,
  projectId: ProjectId,
  url: TrimmedNonEmptyString,
  displayKey: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  source: ThreadIssueLinkSource,
});

export const ThreadIssueUnlinkCommand = z.looseObject({
  type: z.literal("thread.issue.unlink"),
  ...issueCommandFields,
});
