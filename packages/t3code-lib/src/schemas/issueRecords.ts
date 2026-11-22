import { z } from "zod";
import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "./common.ts";
import {
  PullRequestActor,
  PullRequestLabel,
  PullRequestReaction,
  PullRequestState,
} from "./pullRequestParts.ts";

/** An open tracker slug, branded separately from source-control providers. */
export const IssueTrackerKind = TrimmedNonEmptyString.max(64)
  .regex(/^[a-z][a-z0-9-]*$/)
  .brand<"IssueTrackerKind">();
export type IssueTrackerKind = z.infer<typeof IssueTrackerKind>;

export const IssueActor = PullRequestActor;
export type IssueActor = z.infer<typeof IssueActor>;

export const IssueLabel = PullRequestLabel;
export type IssueLabel = z.infer<typeof IssueLabel>;

/**
 * Where an issue stands: the tracker's own name for the state ("In Review", "Closed as not
 * planned"), which is what people read and what a move is asked for by, and the category every
 * tracker has, which only filters and colours key off. Nothing moves an issue to "open" or
 * "closed": it moves to one of the states its `IssueDetail.states` lists.
 */
export const IssueStateCategory = z.enum(["open", "closed"]);
export type IssueStateCategory = z.infer<typeof IssueStateCategory>;

export const IssueState = z.looseObject({
  category: IssueStateCategory,
  name: TrimmedNonEmptyString,
  /** How a closed state ended, where the tracker says: `completed`, or its word for not done. */
  closeReason: TrimmedNonEmptyString.optional(),
});
export type IssueState = z.infer<typeof IssueState>;

export const IssueReactionContent = PullRequestReaction.shape.content;
export type IssueReactionContent = z.infer<typeof IssueReactionContent>;

export const IssueReaction = PullRequestReaction;
export type IssueReaction = z.infer<typeof IssueReaction>;

/**
 * Addresses one issue: `scope` is the tracker's own container (`owner/repo`, a team key) and
 * `key` the issue's native id in it. `host` is absent for the kind's public host. `projectId`
 * names the project whose credentials serve the read, which need not own the issue.
 */
export const IssueRef = z.looseObject({
  projectId: ProjectId,
  tracker: IssueTrackerKind,
  host: TrimmedNonEmptyString.optional(),
  scope: TrimmedNonEmptyString,
  key: TrimmedNonEmptyString,
});
export type IssueRef = z.infer<typeof IssueRef>;

/** A scope with no issue in it, for reads about the container itself: templates, candidates. */
export const IssueScopeRef = z.looseObject({
  projectId: ProjectId,
  tracker: IssueTrackerKind,
  host: TrimmedNonEmptyString.optional(),
  scope: TrimmedNonEmptyString,
});
export type IssueScopeRef = z.infer<typeof IssueScopeRef>;

/** One row of a listing. Carries everything a list needs and nothing a detail needs. */
export const IssueSummary = z.looseObject({
  tracker: IssueTrackerKind,
  host: TrimmedNonEmptyString,
  scope: TrimmedNonEmptyString,
  key: TrimmedNonEmptyString,
  /** How the tracker writes the key for people: `#123` on a git host, `ENG-123` on Linear. */
  displayKey: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  author: IssueActor.nullable(),
  state: IssueState,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  closedAt: IsoDateTime.nullable(),
  assignees: z.array(IssueActor),
  labels: z.array(IssueLabel),
  commentCount: NonNegativeInt,
});
export type IssueSummary = z.infer<typeof IssueSummary>;

export const IssueListEntry = z.looseObject({
  ...IssueSummary.shape,
  projectId: ProjectId,
  projectTitle: TrimmedNonEmptyString,
});
export type IssueListEntry = z.infer<typeof IssueListEntry>;

export const IssueComment = z.looseObject({
  id: TrimmedNonEmptyString,
  author: IssueActor.nullable(),
  body: z.string(),
  createdAt: IsoDateTime,
  url: z.string().nullable(),
  /** Absent from a tracker with no reactions, which differs from none on this comment. */
  reactions: z.array(IssueReaction).optional(),
});
export type IssueComment = z.infer<typeof IssueComment>;

/**
 * Something that happened to an issue that nobody wrote words for: it was closed, labelled,
 * assigned, renamed. Kinds are the common vocabulary; a tracker drops what it cannot map rather
 * than guessing.
 */
export const IssueEventKind = forwardCompatibleLiteral([
  "closed",
  "reopened",
  "labeled",
  "unlabeled",
  "assigned",
  "unassigned",
  "renamed",
  "referenced",
  "state-changed",
]);
export type IssueEventKind = z.infer<typeof IssueEventKind>;

export const IssueEvent = z.looseObject({
  id: TrimmedNonEmptyString,
  kind: IssueEventKind,
  actor: IssueActor.nullable(),
  createdAt: IsoDateTime,
  /** What the event was about, where it has a subject: a label name, a login, a new title. */
  detail: TrimmedNonEmptyString.nullable(),
});
export type IssueEvent = z.infer<typeof IssueEvent>;

/** A change request the tracker says closes or mentions this issue. */
export const IssueLinkedPullRequest = z.looseObject({
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  state: PullRequestState,
  isDraft: z.boolean(),
  /** Merging it closes this issue, rather than only citing it. */
  closesIssue: z.boolean(),
});
export type IssueLinkedPullRequest = z.infer<typeof IssueLinkedPullRequest>;

/**
 * What a tracker can do at all, so a surface never offers an action that would fail. The
 * service refuses a call outside these before it reaches the driver.
 */
export const IssueCapabilities = z.looseObject({
  create: z.boolean(),
  /** Title and body can be rewritten after filing. */
  edit: z.boolean(),
  comment: z.boolean(),
  labels: z.boolean(),
  assignees: z.boolean(),
  /** Reactions can be read and written on the issue and its comments. */
  reactions: z.boolean(),
  /** The scope offers starting points for a new issue. */
  templates: z.boolean(),
  /** The tracker reports linked change requests of its own accord. */
  linkedPullRequests: z.boolean(),
  /** State changes arrive as events beside the comments, not only as comments. */
  events: z.boolean(),
  /** The tracker narrows a listing by free text itself. */
  search: z.boolean(),
});
export type IssueCapabilities = z.infer<typeof IssueCapabilities>;

/**
 * What the signed-in account may do with this issue, which `capabilities` says nothing about.
 * A permission the tracker reports nothing about is granted, so a refusal comes from the
 * tracker, which says why, rather than from a missing control.
 */
export const IssueViewerPermissions = z.looseObject({
  setState: z.boolean(),
  comment: z.boolean(),
  edit: z.boolean(),
  labels: z.boolean(),
  assignees: z.boolean(),
});
export type IssueViewerPermissions = z.infer<typeof IssueViewerPermissions>;

export const IssueDetail = z.looseObject({
  ...IssueSummary.shape,
  projectId: ProjectId,
  projectTitle: TrimmedNonEmptyString,
  /** False for an issue outside every project's scope, which is read-only through this server. */
  writable: z.boolean(),
  capabilities: IssueCapabilities,
  viewerPermissions: IssueViewerPermissions,
  /**
   * Every state this issue can be in, in the tracker's workflow order, its current one included.
   * Empty means its state cannot be changed from here.
   */
  states: z.array(IssueState),
  /** The signed-in account, so a comment edit is offered only on the viewer's own remarks. */
  viewer: TrimmedNonEmptyString.nullable(),
  body: z.string(),
  reactions: z.array(IssueReaction).optional(),
  comments: z.array(IssueComment),
  /** Where older comments carry on; null once the conversation is whole. */
  commentsCursor: TrimmedNonEmptyString.nullable(),
  events: z.array(IssueEvent),
  linkedPullRequests: z.array(IssueLinkedPullRequest),
});
export type IssueDetail = z.infer<typeof IssueDetail>;
