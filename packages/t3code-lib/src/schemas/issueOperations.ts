import { z } from "zod";
import { PositiveInt, ProjectId, TrimmedNonEmptyString } from "./common.ts";
import {
  IssueActor,
  IssueComment,
  IssueLabel,
  IssueListEntry,
  IssueScopeRef,
  IssueRef,
  IssueTrackerKind,
  IssueCapabilities,
} from "./issueRecords.ts";
import { PULL_REQUEST_REACTIONS } from "./pullRequestValues.ts";

/** What a listing asks for: either category, or both. */
export const IssueListState = z.enum(["all", "open", "closed"]);
export type IssueListState = z.infer<typeof IssueListState>;

export const IssueInvolvement = z.enum(["all", "assigned", "authored", "mentioned"]);
export type IssueInvolvement = z.infer<typeof IssueInvolvement>;

/** Newest first by the named date. */
export const IssueListSort = z.enum(["updated", "created"]);
export type IssueListSort = z.infer<typeof IssueListSort>;

export const IssueDetailInput = z.looseObject({
  ...IssueRef.shape,
  /** Read from the tracker instead of reusing a recent read. */
  refresh: z.boolean().optional(),
});
export type IssueDetailInput = z.infer<typeof IssueDetailInput>;

/** Older comments, one page past a cursor the detail or a previous page handed over. */
export const IssueCommentsPageInput = z.looseObject({
  ...IssueRef.shape,
  cursor: TrimmedNonEmptyString.max(4_096),
});
export type IssueCommentsPageInput = z.infer<typeof IssueCommentsPageInput>;

export const IssueCommentsPage = z.looseObject({
  comments: z.array(IssueComment),
  nextCursor: TrimmedNonEmptyString.nullable(),
});
export type IssueCommentsPage = z.infer<typeof IssueCommentsPage>;

/** Where each scope a listing already reached carries on, keyed `"<host> <scope>"`. */
export const IssueListCursors = z.record(TrimmedNonEmptyString, TrimmedNonEmptyString.max(4_096));
export type IssueListCursors = z.infer<typeof IssueListCursors>;

export const ISSUE_LIST_MAX_EXCLUDED_PROJECTS = 1_000;

export const IssueListInput = z.looseObject({
  state: IssueListState,
  involvement: IssueInvolvement.optional(),
  projectId: ProjectId.optional(),
  /** Projects left out of the listing, as the issues page hides them. */
  excludeProjectIds: z.array(ProjectId).max(ISSUE_LIST_MAX_EXCLUDED_PROJECTS).optional(),
  /** Narrows to one host, named as the host itself. Absent means every host the workspace has. */
  host: TrimmedNonEmptyString.optional(),
  /** Rows per scope, which with a continuation is rows per slice. */
  limit: PositiveInt.max(200).optional(),
  /** Carry on from an earlier answer: only the scopes named here are read, one slice each. */
  cursors: IssueListCursors.optional(),
  /** An explicit refresh of the first page may also refresh tracker metadata. */
  refresh: z.boolean().optional(),
  /** Free text the trackers themselves are asked to match. */
  query: TrimmedNonEmptyString.max(200).optional(),
  /** Label names an issue must carry, every one of them. */
  labels: z.array(TrimmedNonEmptyString.max(200)).max(20).optional(),
  /** An assignee's `login`, as an issue of that tracker names them. */
  assignee: TrimmedNonEmptyString.max(320).optional(),
  /** Absent means `updated`. */
  sort: IssueListSort.optional(),
});
export type IssueListInput = z.infer<typeof IssueListInput>;

/** One tracker account the workspace has projects on, and whether it can be read right now. */
export const IssueTrackerSummary = z.looseObject({
  tracker: IssueTrackerKind,
  host: TrimmedNonEmptyString,
  projectCount: PositiveInt,
  capabilities: IssueCapabilities.nullable(),
  /** False when the tracker's tool or credentials are missing, with `detail` saying which. */
  configured: z.boolean(),
  detail: TrimmedNonEmptyString.nullable(),
});
export type IssueTrackerSummary = z.infer<typeof IssueTrackerSummary>;

export const IssueListProjectError = z.looseObject({
  projectId: ProjectId,
  projectTitle: TrimmedNonEmptyString,
  message: TrimmedNonEmptyString,
});
export type IssueListProjectError = z.infer<typeof IssueListProjectError>;

export const IssueListResult = z.looseObject({
  /** The signed-in account per host that involvement compared against. Empty for `all`. */
  viewers: z.record(TrimmedNonEmptyString, TrimmedNonEmptyString),
  trackers: z.array(IssueTrackerSummary),
  /** By update, newest first, across every scope this answer covers. */
  entries: z.array(IssueListEntry),
  errors: z.array(IssueListProjectError),
  /** Where each scope carries on, sent straight back as `cursors`. Absent once a scope is done. */
  nextCursors: IssueListCursors,
  /**
   * Every scope the listing covers, matched or not, with one project that reads it. A Linear team
   * bound in settings is named nowhere else. Absent from servers that predate it.
   */
  scopes: z.array(IssueScopeRef).optional(),
});
export type IssueListResult = z.infer<typeof IssueListResult>;

const IssueTitle = TrimmedNonEmptyString.max(1024);
// Preserve Markdown indentation. The service rejects a comment containing only whitespace.
const IssueBody = z.string().max(65_536);
const CommentBody = z.string().min(1).max(65_536);

export const IssueCreateInput = z.looseObject({
  ...IssueScopeRef.shape,
  title: IssueTitle,
  /** May be empty: an issue with a title and nothing else is a legitimate one. */
  body: IssueBody,
  labels: z.array(TrimmedNonEmptyString).max(50),
  assignees: z.array(TrimmedNonEmptyString).max(25),
});
export type IssueCreateInput = z.infer<typeof IssueCreateInput>;

export const IssueCreateResult = z.looseObject({
  key: TrimmedNonEmptyString,
  displayKey: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
});
export type IssueCreateResult = z.infer<typeof IssueCreateResult>;

export const IssueCommentInput = z.looseObject({
  ...IssueRef.shape,
  body: CommentBody,
});
export type IssueCommentInput = z.infer<typeof IssueCommentInput>;

/**
 * Rewrites the issue's own fields. Every field is optional and only the present ones are
 * written; `labels` and `assignees` are the whole set, which is how every tracker writes them.
 * The service refuses a request with nothing present.
 */
export const IssueUpdateInput = z.looseObject({
  ...IssueRef.shape,
  title: IssueTitle.optional(),
  body: IssueBody.optional(),
  labels: z.array(TrimmedNonEmptyString).max(50).optional(),
  assignees: z.array(TrimmedNonEmptyString).max(25).optional(),
});
export type IssueUpdateInput = z.infer<typeof IssueUpdateInput>;

/** Moves the issue to a state from `IssueDetail.states`. */
export const IssueSetStateInput = z.looseObject({
  ...IssueRef.shape,
  /** The name of one of the issue's `states`. */
  state: TrimmedNonEmptyString,
});
export type IssueSetStateInput = z.infer<typeof IssueSetStateInput>;

export const IssueReactionInput = z.looseObject({
  ...IssueRef.shape,
  /** Absent reacts to the issue itself; present names a comment id as the detail carried it. */
  subjectId: TrimmedNonEmptyString.optional(),
  content: z.enum(PULL_REQUEST_REACTIONS),
  reacted: z.boolean(),
});
export type IssueReactionInput = z.infer<typeof IssueReactionInput>;

/**
 * One starting point a scope offers for a new issue. Only the body-shaped kind travels here:
 * GitHub's typed issue forms are flattened to a body by the driver, so a composer on any
 * tracker is one text box with a draft in it.
 */
export const IssueTemplate = z.looseObject({
  key: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  about: z.string(),
  title: z.string(),
  body: z.string(),
  labels: z.array(TrimmedNonEmptyString),
  assignees: z.array(TrimmedNonEmptyString),
});
export type IssueTemplate = z.infer<typeof IssueTemplate>;

/** A starting point only the tracker's own site can render: Linear's form and rich templates. */
export const IssueExternalTemplate = z.looseObject({
  name: TrimmedNonEmptyString,
  about: z.string(),
  /** Opens the exact template on the tracker, ready to fill in. */
  url: TrimmedNonEmptyString,
});
export type IssueExternalTemplate = z.infer<typeof IssueExternalTemplate>;

export const IssueTemplateList = z.looseObject({
  templates: z.array(IssueTemplate),
  /** Absent from a tracker whose every template is body-shaped. */
  externalTemplates: z.array(IssueExternalTemplate).optional(),
  /** False where the scope's config forbids an issue filed from nothing. */
  blankIssuesEnabled: z.boolean(),
});
export type IssueTemplateList = z.infer<typeof IssueTemplateList>;

export const IssueLabelCandidate = z.looseObject({
  ...IssueLabel.shape,
  description: z.string().nullable(),
});
export type IssueLabelCandidate = z.infer<typeof IssueLabelCandidate>;

export const IssueAssigneeCandidate = z.looseObject({
  ...IssueActor.shape,
  /** How the tracker addresses this person on a write, which is not always the login. */
  id: TrimmedNonEmptyString,
});
export type IssueAssigneeCandidate = z.infer<typeof IssueAssigneeCandidate>;

/** The labels and people a scope offers, read when a picker opens rather than with every issue. */
export const IssueCandidates = z.looseObject({
  labels: z.array(IssueLabelCandidate),
  assignees: z.array(IssueAssigneeCandidate),
  /** The tracker has more than were read, so somebody missing is not necessarily ineligible. */
  truncated: z.boolean(),
});
export type IssueCandidates = z.infer<typeof IssueCandidates>;
