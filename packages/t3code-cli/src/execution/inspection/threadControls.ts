// ---
// relationships:
//   implements: command-line
// ---
import { schemas, T3PreconditionError } from "@wyrd-company/t3code-lib";
import type { InvocationHandler } from "../../main.ts";

function requiredThreadId(value: string | undefined) {
  const parsed = schemas.common.ThreadId.safeParse(value);
  if (!parsed.success) throw new T3PreconditionError("A nonempty thread id is required.");
  return parsed.data;
}

const stop: InvocationHandler = async ([id], command, invocation) => {
  const threadId = requiredThreadId(id);
  const reason: unknown = command.optsWithGlobals()["reason"];
  if (reason !== undefined && typeof reason !== "string")
    throw new T3PreconditionError("The reason must be a string.");
  invocation.errorContext = "dispatch";
  await (
    await invocation.client()
  ).threads.stopThread(threadId, reason === undefined ? {} : { reason });
  invocation.output.finish({ data: { threadId }, exitCode: 0 }, `Stop requested: ${threadId}`);
};

const resume: InvocationHandler = async ([id], _command, invocation) => {
  const threadId = requiredThreadId(id);
  invocation.errorContext = "dispatch";
  await (await invocation.client()).threads.resumeQueue(threadId);
  invocation.output.finish(
    { data: { threadId }, exitCode: 0 },
    `Queue resume requested: ${threadId}`,
  );
};

const start: InvocationHandler = async ([id, selected], _command, invocation) => {
  const threadId = requiredThreadId(id);
  const parsed = schemas.common.RunId.safeParse(selected);
  if (!parsed.success) throw new T3PreconditionError("A nonempty run id is required.");
  const runId = parsed.data;
  invocation.errorContext = "dispatch";
  await (await invocation.client()).threads.startQueuedRun(threadId, runId);
  invocation.output.finish(
    { data: { threadId, runId }, exitCode: 0 },
    `Queued run start requested: ${threadId}\t${runId}`,
  );
};

const tag: InvocationHandler = async ([id, value], command, invocation) => {
  const threadId = requiredThreadId(id);
  const parsed = schemas.orchestrationThreadTags.ThreadTag.safeParse(value);
  if (!parsed.success)
    throw new T3PreconditionError("A tag is one line of 1 to 64 characters after trimming.");
  const tagged = command.optsWithGlobals()["remove"] !== true;
  invocation.errorContext = "dispatch";
  const tags = await (await invocation.client()).threads.setTag(threadId, parsed.data, tagged);
  invocation.output.finish({ data: { threadId, tags }, exitCode: 0 }, tags.join("\n"));
};

export const threadControlHandlers: Record<string, InvocationHandler> = {
  "thread stop": stop,
  "thread tag": tag,
  "thread queue resume": resume,
  "thread queue start": start,
};
