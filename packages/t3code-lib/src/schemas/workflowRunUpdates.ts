import type { WorkflowRunsChange, WorkflowRunsSnapshot, WorkflowRunsUpdate } from "./workflow.ts";

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
