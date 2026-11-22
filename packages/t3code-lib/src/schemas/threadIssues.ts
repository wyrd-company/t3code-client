import { z } from "zod";
import {
  IsoDateTime,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "./common.ts";
import { IssueTrackerKind } from "./issueRecords.ts";

/** Who created a thread ↔ issue link. */
export const ThreadIssueLinkSource = z.enum(["manual", "agent"]);
export type ThreadIssueLinkSource = z.infer<typeof ThreadIssueLinkSource>;

/**
 * Identity of an issue as a thread link sees it: tracker-level, so the same issue linked through
 * two projects compares equal. `host` is always written here, unlike `IssueRef`, because a link
 * outlives the project whose binding supplied the default.
 */
export const ThreadIssueKey = z.looseObject({
  tracker: IssueTrackerKind,
  host: TrimmedNonEmptyString,
  scope: TrimmedNonEmptyString,
  key: TrimmedNonEmptyString,
});
export type ThreadIssueKey = z.infer<typeof ThreadIssueKey>;

/**
 * An issue linked to a thread. `projectId` is the project the issue is read through, which the
 * detail panel needs; `url` is what the agent or user handed over.
 */
export const ThreadIssueLink = z.looseObject({
  ...ThreadIssueKey.shape,
  projectId: ProjectId,
  url: TrimmedNonEmptyString,
  source: forwardCompatibleLiteral(["manual", "agent"]),
  linkedAt: IsoDateTime,
  /** As the tracker named the issue when it was linked; opening it reads the live state. */
  displayKey: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
});
export type ThreadIssueLink = z.infer<typeof ThreadIssueLink>;

export function threadIssueKeyOf(key: ThreadIssueKey): string {
  return `${key.tracker}\u0000${key.host.trim().toLowerCase()}\u0000${key.scope.trim().toLowerCase()}\u0000${key.key.trim()}`;
}

export function threadIssueKeysEqual(left: ThreadIssueKey, right: ThreadIssueKey): boolean {
  return threadIssueKeyOf(left) === threadIssueKeyOf(right);
}

/** The threads an issue is linked to, most recently active first. */
export const IssueLinkedThreadsResult = z.looseObject({
  threads: z.array(
    z.looseObject({
      id: ThreadId,
      projectId: ProjectId,
      title: z.string(),
      archivedAt: IsoDateTime.nullable(),
      settled: z.boolean(),
    }),
  ),
});
export type IssueLinkedThreadsResult = z.infer<typeof IssueLinkedThreadsResult>;
