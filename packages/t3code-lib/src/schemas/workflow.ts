// ---
// relationships:
//   implements: library
// ---
/**
 * Durable workflows (`workflow.ts`): runs, their steps and questions, the definition files, and
 * the `workflows.*` inputs. A beta: servers run them only with `workflowsEnabled` on.
 */
import { z } from "zod";
import { JsonValue, forwardCompatibleLiteral } from "./common.ts";
import { IssueRef } from "./issueRecords.ts";
import { PullRequestRef } from "./pullRequestInputs.ts";

/** `skipped`: ended by the workflow as not its to do. Lists leave these out unless asked. */
export const WorkflowRunStatus = forwardCompatibleLiteral([
  "running",
  "waiting",
  "paused",
  "completed",
  "stopped",
  "skipped",
  "cancelled",
]);
export type WorkflowRunStatus = z.infer<typeof WorkflowRunStatus>;

export const WorkflowRun = z.looseObject({
  runId: z.string(),
  workflow: z.string(),
  version: z.number(),
  title: z.string(),
  status: WorkflowRunStatus,
  /** Why it is paused, what it waits on, or how it ended. */
  detail: z.string().nullable(),
  result: JsonValue.nullable(),
  /** How many times in a row a failing step has paused it. */
  pauses: z.number(),
  /** Its version is no longer registered, so it cannot go on until that version is back. */
  retired: z.boolean(),
  /** When a paused run resumes without anyone asking; null when it waits for a person. */
  resumesAt: z.string().nullable(),
  /** The run that invoked this one and waits for it; null for a run started by itself. */
  parentRunId: z.string().nullable(),
  /** The step of that run this one was invoked as. */
  parentStep: z.string().nullable(),
  /** What the workflow tagged the run with. Absent for a run with no tags. */
  tags: z.array(z.string()).optional(),
  startedAt: z.string(),
  updatedAt: z.string(),
  endedAt: z.string().nullable(),
});
export type WorkflowRun = z.infer<typeof WorkflowRun>;

export const WorkflowStep = z.looseObject({
  name: z.string(),
  /** A sleep's `detail` is when it wakes, as an ISO time. */
  kind: forwardCompatibleLiteral(["step", "wait", "agent", "ask", "sleep"]),
  status: forwardCompatibleLiteral(["running", "completed", "failed"]),
  attempts: z.number(),
  detail: z.string().nullable(),
  /** The thread an agent step ran in. */
  threadId: z.string().nullable(),
  /** The linked environment that thread is in; null when it is this one. */
  environmentId: z.string().nullable(),
  /** What it produced: a step's value, an agent's data or reply, the answer to a question. */
  result: JsonValue.nullable(),
  /** What an agent said in closing, when its result is data and not that reply. */
  said: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
});
export type WorkflowStep = z.infer<typeof WorkflowStep>;

/** A question a run asked. Answer it with `workflows.answer` and its run and name. */
export const WorkflowQuestion = z.looseObject({
  runId: z.string(),
  name: z.string(),
  /** What `ask` was given: a title, the choices, and data to lay out. */
  request: JsonValue,
  /** The kind of question its workflow declared for it. */
  kind: z.string().optional(),
  askedAt: z.string(),
  /** The run's latest agent thread, for talking it through before answering. */
  thread: z.looseObject({ threadId: z.string(), environmentId: z.string().nullable() }).nullable(),
});
export type WorkflowQuestion = z.infer<typeof WorkflowQuestion>;

/**
 * Where a workflow takes requests: a webhook endpoint whose `hookId` starts with `wf-`. `path`
 * holds the hook's secret. Posting to it answers 202 with the run it started (`WorkflowHookAccepted`).
 */
export const WorkflowHook = z.looseObject({
  workflow: z.string(),
  name: z.string(),
  path: z.string(),
});
export type WorkflowHook = z.infer<typeof WorkflowHook>;

/** A workflow hook's 202: the run the request started. */
export const WorkflowHookAccepted = z.looseObject({ runId: z.string().min(1) });
export type WorkflowHookAccepted = z.infer<typeof WorkflowHookAccepted>;

/**
 * A webhook endpoint's refusal, as it arrives in `T3HttpError.body`. A workflow hook answers 400
 * `invalid_request` with the `problem` its input check found (including that workflows are
 * off), 403 `blocked_by_policy`, 404 `hook_not_found`, 429 `rate_limited` with
 * `Retry-After: 60` (`T3HttpError.retryAfter`), and 500 `internal_error`. Every endpoint also
 * answers 405 `method_not_allowed` to `HEAD` and 413 `body_too_large`.
 */
export const WebhookFailure = z.looseObject({
  error: forwardCompatibleLiteral([
    "invalid_request",
    "blocked_by_policy",
    "hook_not_found",
    "rate_limited",
    "internal_error",
    "method_not_allowed",
    "body_too_large",
    "body_too_large_or_unreadable",
  ]),
  /** A workflow hook's 400: what was wrong with the request, in words. */
  problem: z.string().optional(),
});
export type WebhookFailure = z.infer<typeof WebhookFailure>;

/** A workflow this server has registered, at its newest version, and what starts it. */
export const WorkflowSummary = z.looseObject({
  name: z.string(),
  version: z.number(),
  /** In words, such as "every 1h". Empty when only started by hand. */
  triggers: z.array(z.string()),
  /** The kinds of question it declares, in order, each with its label. */
  asks: z.array(z.looseObject({ kind: z.string(), label: z.string() })).optional(),
});
export type WorkflowSummary = z.infer<typeof WorkflowSummary>;

/** Something wrong with the definitions: in `file` when it is one file's, at `line` when it names one. */
export const WorkflowDefinitionProblem = z.looseObject({
  message: z.string(),
  file: z.string().optional(),
  line: z.number().optional(),
});
export type WorkflowDefinitionProblem = z.infer<typeof WorkflowDefinitionProblem>;

/** Which loading of the definitions is running, and what is wrong with the files now. */
export const WorkflowDefinitionState = z.looseObject({
  /** Goes up whenever the definitions load or are found wrong, so a client reads them again. */
  revision: z.number(),
  /** Why the files on disk are not what runs. The last version that loaded keeps running. */
  problem: z.string().nullable(),
});
export type WorkflowDefinitionState = z.infer<typeof WorkflowDefinitionState>;

export const WorkflowDefinitionFile = z.looseObject({
  name: z.string(),
  /** The file as it is on disk, which is not what runs while it has problems. */
  source: z.string(),
  /** The workflows its last good version defines, each as `name@version`. */
  workflows: z.array(z.string()),
  problems: z.array(WorkflowDefinitionProblem),
});
export type WorkflowDefinitionFile = z.infer<typeof WorkflowDefinitionFile>;

/** The files that define this server's workflows. */
export const WorkflowDefinitionFiles = z.looseObject({
  /** The folder the files are in. */
  directory: z.string(),
  /** The server was pointed at one file: none can be added beside it or taken away. */
  single: z.boolean(),
  files: z.array(WorkflowDefinitionFile),
  /** What is wrong between files, such as one workflow defined in two of them. */
  problems: z.array(WorkflowDefinitionProblem),
  ...WorkflowDefinitionState.shape,
});
export type WorkflowDefinitionFiles = z.infer<typeof WorkflowDefinitionFiles>;

export const WorkflowDefinitionGetInput = z.looseObject({});
/** A file by its name in the folder. Saving a name that is not there yet makes the file. */
export const WorkflowDefinitionSaveInput = z.looseObject({ name: z.string(), source: z.string() });
export type WorkflowDefinitionSaveInput = z.infer<typeof WorkflowDefinitionSaveInput>;
export const WorkflowDefinitionDeleteInput = z.looseObject({ name: z.string() });
export type WorkflowDefinitionDeleteInput = z.infer<typeof WorkflowDefinitionDeleteInput>;
export const WorkflowDefinitionChangeResult = z.looseObject({
  /** The file was written or deleted. */
  changed: z.boolean(),
  /** Empty when the change is what runs now. With `changed`, why it does not run yet. */
  problems: z.array(WorkflowDefinitionProblem),
});
export type WorkflowDefinitionChangeResult = z.infer<typeof WorkflowDefinitionChangeResult>;

/** The whole list a `workflows.subscribe` frame carries: recent runs, newest first, and open questions. */
export const WorkflowRunsSnapshot = z.looseObject({
  workflows: z.array(WorkflowSummary),
  runs: z.array(WorkflowRun),
  questions: z.array(WorkflowQuestion),
  definition: WorkflowDefinitionState.optional(),
});
export type WorkflowRunsSnapshot = z.infer<typeof WorkflowRunsSnapshot>;

/** How much is going on, for a badge that must not cost a list of runs to keep current. */
export const WorkflowCounts = z.looseObject({
  /** Open questions and paused runs: what waits on a person. */
  needsYou: z.number(),
  /** Runs that have not ended. */
  active: z.number(),
  /** Runs there have ever been, so a client knows whether workflows are in use at all. */
  total: z.number(),
});
export type WorkflowCounts = z.infer<typeof WorkflowCounts>;

/** What changed in the runs list since the last frame a watcher was sent. */
export const WorkflowRunsChange = z.looseObject({
  _tag: z.literal("changed"),
  /** Runs new to the list or different from what was last sent. */
  runs: z.array(WorkflowRun),
  /** Runs that left the list, by id. */
  removed: z.array(z.string()),
  /** Questions newly asked or different from what was last sent. */
  questions: z.array(WorkflowQuestion),
  /** Questions no longer open, by run and question name. */
  closed: z.array(z.looseObject({ runId: z.string(), name: z.string() })),
});
export type WorkflowRunsChange = z.infer<typeof WorkflowRunsChange>;

/**
 * A frame of `workflows.subscribe`: the whole list, or with `changes` asked for, what changed
 * since the last frame. A server older than `changes` ignores it and sends whole lists.
 */
export const WorkflowRunsUpdate = z.union([WorkflowRunsChange, WorkflowRunsSnapshot]);
export type WorkflowRunsUpdate = z.infer<typeof WorkflowRunsUpdate>;

export const WorkflowRunsSubscribeInput = z.looseObject({
  /** Send what changed after the first list instead of the whole list every time. */
  changes: z.boolean().optional(),
});
export type WorkflowRunsSubscribeInput = z.infer<typeof WorkflowRunsSubscribeInput>;

export const WorkflowRunGetInput = z.looseObject({ runId: z.string() });
export type WorkflowRunGetInput = z.infer<typeof WorkflowRunGetInput>;

/**
 * Something a run touched: an issue, a pull request, or a kind added later. `kind` is open, so a
 * client shows a kind it does not know by its title and `url`. `address` is whatever that kind
 * needs to open it: an `IssueRef` for `issue`, a `PullRequestRef` for `pullRequest`.
 */
export const WorkflowRunReference = z.looseObject({
  kind: z.string(),
  key: z.string(),
  address: JsonValue,
  /** Empty until something that touched it knew its title. */
  title: z.string(),
  url: z.string().nullable(),
  /** A word for where it stands, such as `open`, `merged` or `closed`. */
  state: z.string().nullable(),
  /** The steps that touched it, in the order they first did. */
  steps: z.array(z.string()),
  origin: forwardCompatibleLiteral(["trigger", "step"]),
});
export type WorkflowRunReference = z.infer<typeof WorkflowRunReference>;

/** The reference kinds runs record today, and the schemas of their `address`. */
export const WorkflowReferenceKind = { issue: "issue", pullRequest: "pullRequest" } as const;
export const WorkflowIssueAddress = IssueRef;
export const WorkflowPullRequestAddress = PullRequestRef;

/** One run with its steps, in the order they started, and what it touched. */
export const WorkflowRunDetail = z.looseObject({
  run: WorkflowRun,
  steps: z.array(WorkflowStep),
  references: z.array(WorkflowRunReference),
});
export type WorkflowRunDetail = z.infer<typeof WorkflowRunDetail>;

/** A person's answer to a `WorkflowQuestion`: one of its choices and, if they gave one, why. */
export const WorkflowAnswerInput = z.looseObject({
  runId: z.string(),
  name: z.string(),
  choice: z.string(),
  reason: z.string().optional(),
});
export type WorkflowAnswerInput = z.infer<typeof WorkflowAnswerInput>;

export const WorkflowRunResumeInput = z.looseObject({ runId: z.string() });
export type WorkflowRunResumeInput = z.infer<typeof WorkflowRunResumeInput>;

export const WorkflowRunCancelInput = z.looseObject({
  runId: z.string(),
  reason: z.string().optional(),
});
export type WorkflowRunCancelInput = z.infer<typeof WorkflowRunCancelInput>;

/** What names an open question: one run asks one question of a name at a time. */
export const workflowQuestionKey = (question: { readonly runId: string; readonly name: string }) =>
  JSON.stringify([question.runId, question.name]);

/** A frame of what changed, as opposed to a whole list. */
export function isWorkflowRunsChange(update: WorkflowRunsUpdate): update is WorkflowRunsChange {
  return update["_tag"] === "changed";
}

/** The list once `update` is applied, in the order the server lists runs: newest first. */
export function applyWorkflowRunsUpdate(
  snapshot: WorkflowRunsSnapshot | undefined,
  update: WorkflowRunsUpdate,
): WorkflowRunsSnapshot {
  if (!isWorkflowRunsChange(update)) return update;
  const base = snapshot ?? { workflows: [], runs: [], questions: [] };
  // Stable sorts, so entries of the same moment keep the order they were sent in.
  const runs = merged(base.runs, update.runs, update.removed, (run) => run.runId).sort(
    (left, right) =>
      left.startedAt === right.startedAt ? 0 : left.startedAt < right.startedAt ? 1 : -1,
  );
  const questions = merged(
    base.questions,
    update.questions,
    update.closed.map(workflowQuestionKey),
    workflowQuestionKey,
  ).sort((left, right) =>
    left.askedAt === right.askedAt ? 0 : left.askedAt < right.askedAt ? -1 : 1,
  );
  return { ...base, runs, questions };
}

/** `held` with `changed` put in place of their earlier versions and `gone` left out. */
function merged<A>(
  held: readonly A[],
  changed: readonly A[],
  gone: readonly string[],
  key: (entry: A) => string,
): A[] {
  const fresh = new Map(changed.map((entry) => [key(entry), entry]));
  const left = new Set(gone);
  const kept = held.flatMap((entry) => {
    const id = key(entry);
    if (left.has(id)) return [];
    const next = fresh.get(id);
    fresh.delete(id);
    return [next ?? entry];
  });
  return [...fresh.values(), ...kept];
}
