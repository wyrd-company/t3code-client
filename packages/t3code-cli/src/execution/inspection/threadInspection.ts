// ---
// relationships:
//   implements: command-line
// ---
import {
  pendingRequests,
  schemas,
  T3PreconditionError,
  type OrchestrationV2Run,
  type PendingRequest,
  type ThreadDiffRange,
  type ThreadId,
  type ThreadStatus,
  type ThreadUsage,
} from "@wyrd-company/t3code-lib";
import type { InvocationHandler } from "../../main.ts";

const SEARCH_MAX_LIMIT = 50;

function requiredThreadId(value: string | undefined, label = "thread id"): ThreadId {
  const parsed = schemas.common.ThreadId.safeParse(value);
  if (!parsed.success) throw new T3PreconditionError(`A nonempty ${label} is required.`);
  return parsed.data;
}

function count(value: unknown, flag: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const text = typeof value === "string" ? value.trim() : "";
  const number = /^\d+$/u.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw new T3PreconditionError(`${flag} must be an integer from ${min} to ${max}.`);
  return number;
}

function runLine(label: string, run: OrchestrationV2Run | null): string {
  return run === null ? `${label}\tnone` : `${label}\t${run.id}\t${run.status}\t#${run.ordinal}`;
}

function statusText(status: ThreadStatus): string {
  const { thread } = status;
  const queued = status.queuedRuns.length;
  return [
    `thread\t${thread.id}\t${thread.title}`,
    `project\t${thread.projectId}`,
    `model\t${thread.providerInstanceId}\t${thread.modelSelection.model}`,
    `modes\t${thread.runtimeMode}\t${thread.interactionMode}`,
    `workspace\t${thread.branch ?? "-"}\t${thread.worktreePath ?? "-"}`,
    runLine("active", status.activeRun),
    runLine("latest", status.latestRun),
    `queued\t${queued}${status.queueHeld ? "\theld" : ""}`,
    ...status.queuedRuns.map((run) => runLine("queuedRun", run)),
    `requests\tapprovals ${status.pendingRequests.approvals}\tquestions ${status.pendingRequests.questions}`,
    `background\t${status.backgroundWork === null ? "unavailable" : status.backgroundWork.length}`,
  ].join("\n");
}

function requestText(request: PendingRequest): string {
  const head = `${request.requestId}\t${request.kind}\t${request.request.kind}`;
  if (request.kind === "approval") return `${head}\t${request.item?.prompt ?? "-"}`;
  const questions = request.questions.map((question) => {
    const options = question.options.map((option) => option.label).join("|");
    return `\n  ${question.id}: ${question.question}${options ? ` [${options}]` : ""}`;
  });
  return `${head}${questions.join("")}`;
}

function usageText(usage: ThreadUsage): string {
  const lines = usage.providerThreads.map((thread) => {
    const context = thread.contextUsage;
    const tokens =
      context === null ? "unreported" : `${context.usedTokens}/${context.maxTokens ?? "?"} tokens`;
    const cost = context?.cost ? `\t${context.cost.amount} ${context.cost.currency}` : "";
    return `providerThread\t${thread.providerThreadId}\t${thread.providerInstanceId}\t${thread.status}\t${tokens}${cost}`;
  });
  for (const turn of usage.providerTurns) {
    const tokens = turn.tokenUsage ? `${turn.tokenUsage.usedTokens} tokens` : "unreported";
    const status = turn.turnTokenUsage ? `\t${turn.turnTokenUsage.usageStatus}` : "";
    lines.push(
      `providerTurn\t${turn.providerTurnId}\t${turn.runId ?? "-"}\t${turn.status}\t${tokens}${status}`,
    );
  }
  return lines.join("\n");
}

const threadStatus: InvocationHandler = async ([id], _command, invocation) => {
  const thread = requiredThreadId(id);
  const data = await (await invocation.client()).threads.status(thread);
  invocation.output.finish({ data, exitCode: 0 }, statusText(data));
};

const threadRequests: InvocationHandler = async ([id], _command, invocation) => {
  const thread = requiredThreadId(id);
  const client = await invocation.client();
  let data = await client.threads.pendingRequests(thread);
  // The bounded projection can omit an older request's timeline row; the full detail has it.
  if (data.some((request) => request.item === undefined))
    data = pendingRequests((await client.threads.detail(thread)).projection);
  invocation.output.finish({ data, exitCode: 0 }, data.map(requestText).join("\n"));
};

const threadUsage: InvocationHandler = async ([id], _command, invocation) => {
  const thread = requiredThreadId(id);
  const data = await (await invocation.client()).threads.usage(thread);
  invocation.output.finish({ data, exitCode: 0 }, usageText(data));
};

const threadDiff: InvocationHandler = async ([id], command, invocation) => {
  const thread = requiredThreadId(id);
  const options = command.optsWithGlobals();
  const from = options["fromTurn"];
  const to = options["toTurn"];
  let range: ThreadDiffRange | undefined;
  if (from !== undefined || to !== undefined) {
    if (from === undefined || to === undefined)
      throw new T3PreconditionError("Supply --from-turn and --to-turn together.");
    range = {
      fromTurnCount: count(from, "--from-turn", 0),
      toTurnCount: count(to, "--to-turn", 0),
    };
    if (range.fromTurnCount > range.toTurnCount)
      throw new T3PreconditionError("--from-turn must not exceed --to-turn.");
  }
  const data = await (await invocation.client()).threads.diff(thread, range);
  invocation.output.finish({ data, exitCode: 0 }, data.diff.replace(/\n$/u, ""));
};

const threadSearch: InvocationHandler = async ([query], command, invocation) => {
  const options = command.optsWithGlobals();
  const text = query?.trim() ?? "";
  if (options["thread"] !== undefined) {
    const thread = requiredThreadId(options["thread"] as string, "--thread id");
    if (text.length < 1 || text.length > 200)
      throw new T3PreconditionError("A within-thread query must have 1-200 characters.");
    const data = await (
      await invocation.client()
    ).threads.searchContent({
      threadId: thread,
      query: text,
    });
    const match = data.match;
    invocation.output.finish(
      { data, exitCode: 0 },
      [
        `matches\t${data.totalMatches}`,
        ...(match ? [`first\t${match.entryId}\t${match.runId ?? "-"}\t${match.occurrence}`] : []),
      ].join("\n"),
    );
    return;
  }
  if (text.length < 2 || text.length > 200)
    throw new T3PreconditionError("A search query must have 2-200 characters.");
  const limit =
    options["limit"] === undefined
      ? undefined
      : count(options["limit"], "--limit", 1, SEARCH_MAX_LIMIT);
  const data = await (
    await invocation.client()
  ).threads.search({
    query: text,
    ...(limit === undefined ? {} : { limit }),
  });
  if (!invocation.output.json && data.matches.length >= data.limit)
    invocation.output.progress(`Showing the limit of ${data.limit} threads; more may match.`);
  invocation.output.finish(
    { data, exitCode: 0 },
    data.matches
      .map(
        (match) =>
          `${match.threadId}\t${match.projectId}\t${match.source}\t${match.snippet.replace(/\s+/gu, " ")}`,
      )
      .join("\n"),
  );
};

export const threadInspectionHandlers: Record<string, InvocationHandler> = {
  "thread status": threadStatus,
  "thread requests": threadRequests,
  "thread usage": threadUsage,
  "thread diff": threadDiff,
  "thread search": threadSearch,
};
