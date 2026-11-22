import { z } from "zod";
import { ProjectId, TrimmedNonEmptyString } from "./common.ts";
import { IssueTrackerKind } from "./issueRecords.ts";

/**
 * A tracker that is not a git host: it is reached with its own credential rather than a
 * checkout's, and a project opts into it by binding one of the tracker's scopes. Everything a
 * client needs to draw the connect flow for any such tracker without knowing which one it is.
 */
export const StandaloneIssueTrackerDescriptor = z.looseObject({
  tracker: IssueTrackerKind,
  displayName: TrimmedNonEmptyString,
  /** Where the tracker is served from; what `IssueRef.host` carries for its issues. */
  host: TrimmedNonEmptyString,
  /** What the tracker calls its container, in the singular: "team" on Linear, "project" on Jira. */
  scopeNoun: TrimmedNonEmptyString,
  credential: z.looseObject({
    /** What the tracker calls the credential: "Personal API key", "API token". */
    label: TrimmedNonEmptyString,
    /** Where to mint one, or null when the tracker has no stable page for it. */
    helpUrl: TrimmedNonEmptyString.nullable(),
  }),
});
export type StandaloneIssueTrackerDescriptor = z.infer<typeof StandaloneIssueTrackerDescriptor>;

/** Which standalone tracker scope a project's issues come from, beside its git host's own. */
export const IssueTrackerProjectBinding = z.looseObject({
  tracker: IssueTrackerKind,
  scope: TrimmedNonEmptyString,
});
export type IssueTrackerProjectBinding = z.infer<typeof IssueTrackerProjectBinding>;

/** One container the connected account can read, offered when a project is bound. */
export const IssueTrackerScope = z.looseObject({
  key: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
});
export type IssueTrackerScope = z.infer<typeof IssueTrackerScope>;

/**
 * A standalone tracker as the settings page sees it: the descriptor, whether a credential is
 * stored and still works, and the scopes it can reach. `scopes` is empty until connected.
 */
export const IssueTrackerConnection = z.looseObject({
  ...StandaloneIssueTrackerDescriptor.shape,
  /** A credential is stored. It may still be rejected, which `account` being null reports. */
  connected: z.boolean(),
  /** Who the credential signs in as, or null when there is none or it was refused. */
  account: TrimmedNonEmptyString.nullable(),
  /** Why a stored credential did not work, when it did not. */
  detail: TrimmedNonEmptyString.nullable(),
  /** The workspace the credential reaches, as its issue URLs name it; links elsewhere are foreign. */
  workspace: TrimmedNonEmptyString.optional(),
  scopes: z.array(IssueTrackerScope),
});
export type IssueTrackerConnection = z.infer<typeof IssueTrackerConnection>;

export const IssueTrackerConnectionList = z.looseObject({
  trackers: z.array(IssueTrackerConnection),
  /** Which standalone tracker scope each bound project reads; a project absent here reads none. */
  bindings: z.record(ProjectId, IssueTrackerProjectBinding),
});
export type IssueTrackerConnectionList = z.infer<typeof IssueTrackerConnectionList>;

/** A credential for one standalone tracker; `null` disconnects it and unbinds its projects. */
export const IssueTrackerConnectInput = z.looseObject({
  tracker: IssueTrackerKind,
  token: TrimmedNonEmptyString.max(4_096).nullable(),
});
export type IssueTrackerConnectInput = z.infer<typeof IssueTrackerConnectInput>;

export const IssueTrackerBindProjectInput = z.looseObject({
  projectId: ProjectId,
  /** Null unbinds. */
  binding: IssueTrackerProjectBinding.nullable(),
});
export type IssueTrackerBindProjectInput = z.infer<typeof IssueTrackerBindProjectInput>;
