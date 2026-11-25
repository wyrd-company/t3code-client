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

/**
 * One saved account of a standalone tracker. A tracker's first account has none: it predates
 * accounts, and keeps its credential and bindings unchanged.
 */
export const IssueTrackerAccountId = TrimmedNonEmptyString.max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .brand<"IssueTrackerAccountId">();
export type IssueTrackerAccountId = z.infer<typeof IssueTrackerAccountId>;

export const MAX_ISSUE_TRACKER_ADDITIONAL_SCOPES = 250;

/**
 * Which standalone tracker scopes a project's issues come from, beside its git host's own.
 * `scope` is where agents file new issues; `additionalScopes` are listed and written too.
 */
export const IssueTrackerProjectBinding = z.looseObject({
  tracker: IssueTrackerKind,
  /** The account the scope is read with; absent for the tracker's first account. */
  accountId: IssueTrackerAccountId.optional(),
  scope: TrimmedNonEmptyString,
  additionalScopes: z
    .array(TrimmedNonEmptyString)
    .max(MAX_ISSUE_TRACKER_ADDITIONAL_SCOPES)
    .optional(),
});
export type IssueTrackerProjectBinding = z.infer<typeof IssueTrackerProjectBinding>;

/** Every scope a binding reads: its own, then its additional ones. */
export const issueTrackerBindingScopes = (binding: IssueTrackerProjectBinding): string[] => [
  binding.scope,
  ...(binding.additionalScopes ?? []),
];

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
  /** Which of the tracker's accounts this is; absent for its first. */
  accountId: IssueTrackerAccountId.optional(),
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
  /** Each standalone tracker's first account. */
  trackers: z.array(IssueTrackerConnection),
  /** The accounts added beside a tracker's first, oldest first. Absent from older servers. */
  accounts: z.array(IssueTrackerConnection).optional(),
  /** The scopes each project bound with a tracker's first account reads. */
  bindings: z.record(ProjectId, IssueTrackerProjectBinding),
  /** Projects bound with an added account. Absent from older servers. */
  accountBindings: z.record(ProjectId, IssueTrackerProjectBinding).optional(),
});
export type IssueTrackerConnectionList = z.infer<typeof IssueTrackerConnectionList>;

/**
 * A credential for one standalone tracker account; `null` disconnects it and unbinds its
 * projects. `addAccount` saves the credential as a new account beside the existing ones; a
 * server that advertises `issueTrackerAccounts` keeps more than one.
 */
export const IssueTrackerConnectInput = z.looseObject({
  tracker: IssueTrackerKind,
  accountId: IssueTrackerAccountId.optional(),
  addAccount: z.boolean().optional(),
  token: TrimmedNonEmptyString.max(4_096).nullable(),
});
export type IssueTrackerConnectInput = z.infer<typeof IssueTrackerConnectInput>;

export const IssueTrackerBindProjectInput = z.looseObject({
  projectId: ProjectId,
  /** Null unbinds. */
  binding: IssueTrackerProjectBinding.nullable(),
  /** On an unbind, the account the binding was made with; absent for a tracker's first. */
  accountId: IssueTrackerAccountId.optional(),
});
export type IssueTrackerBindProjectInput = z.infer<typeof IssueTrackerBindProjectInput>;
