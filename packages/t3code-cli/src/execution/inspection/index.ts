// ---
// relationships:
//   implements: command-line
// ---
import * as NodePath from "node:path";
import { T3PreconditionError, threadId } from "@wyrd-company/t3code-lib";
import type { InvocationHandler } from "../../main.ts";
import { lastAssistantMessage, readConversation } from "../transcript.ts";
import { respond } from "./respond.ts";
import { threadFind } from "./threadFind.ts";

const projectList: InvocationHandler = async (_, _command, invocation) => {
  const data = await (await invocation.client()).projects.list();
  invocation.output.finish(
    { data, exitCode: 0 },
    data.map((project) => `${project.id}\t${project.title}\t${project.workspaceRoot}`).join("\n"),
  );
};
const projectEnsure: InvocationHandler = async ([directory], _command, invocation) => {
  if (!directory?.trim()) throw new T3PreconditionError("A workspace directory is required.");
  const client = await invocation.client();
  invocation.errorContext = "dispatch";
  const data = await client.projects.ensure({
    workspaceRoot: directory,
    title: NodePath.basename(directory.replace(/[\\/]+$/u, "")) || directory,
  });
  invocation.output.finish(
    { data, exitCode: 0 },
    `${data.id}\t${data.title}\t${data.workspaceRoot}`,
  );
};
const serverInfo: InvocationHandler = async (_, _command, invocation) => {
  const client = await invocation.client();
  const [environment, providers] = await Promise.all([
    client.server.environment(),
    client.server.providers(),
  ]);
  const data = { environment, providers };
  invocation.output.finish({ data, exitCode: 0 }, JSON.stringify(data, null, 2));
};
const threadList: InvocationHandler = async (_, _command, invocation) => {
  const client = await invocation.client();
  const data = await client.threads.list();
  invocation.output.finish(
    { data, exitCode: 0 },
    data
      .map((thread) => `${thread.id}\t${client.threads.phase(thread)}\t${thread.title}`)
      .join("\n"),
  );
};
const threadRead: InvocationHandler = async ([id], command, invocation) => {
  const options = command.optsWithGlobals();
  if (options["last"] && options["full"]) throw new T3PreconditionError("Choose --last or --full.");
  const items = await readConversation(await invocation.client(), id!);
  const data = options["last"] ? lastAssistantMessage(items) : items;
  const text =
    typeof data === "string"
      ? data
      : data === null
        ? ""
        : data.map((item) => `${item.role}: ${item.text}`).join("\n\n");
  invocation.output.finish({ data, exitCode: 0 }, text);
};
const threadInterrupt: InvocationHandler = async ([id], _command, invocation) => {
  const client = await invocation.client();
  invocation.errorContext = "dispatch";
  await client.threads.interrupt(threadId(id!));
  invocation.output.finish(
    { data: { threadId: id }, exitCode: 0 },
    `Interruption requested: ${id}`,
  );
};

export const inspectionHandlers: Record<string, InvocationHandler> = {
  "project list": projectList,
  "project ensure": projectEnsure,
  "server info": serverInfo,
  "thread list": threadList,
  "thread find": threadFind,
  "thread read": threadRead,
  "thread interrupt": threadInterrupt,
  "thread respond": respond,
};
