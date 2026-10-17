// ---
// relationships:
//   implements: command-contract
// ---
import * as NodeCrypto from "node:crypto";
import {
  T3AuthError,
  T3PreconditionError,
  ensureScopes,
  grantedScopes,
  threadId,
} from "@wyrd-company/t3code-lib";
import type { Invocation } from "../context.ts";
import type { FollowTarget } from "./followTarget.ts";
import {
  missingResource,
  selectModel,
  selectProject,
  validateDispatchOptions,
  type DispatchOptions,
} from "./selection.ts";

/** The project's current checkout when no explicit base ref is supplied. */
export const defaultWorktreeBaseRef = "HEAD";

/** Resolve all selections and permissions before the first thread mutation. */
export async function dispatchPrompt(
  invocation: Invocation,
  text: string,
  options: DispatchOptions,
  remember: (target: FollowTarget) => void = () => {},
): Promise<FollowTarget> {
  validateDispatchOptions(options);
  const client = await invocation.client();
  invocation.errorContext = "connection";
  const session = await client.auth.sessionState();
  if (!session.authenticated)
    throw new T3AuthError("Authentication required.", {
      code: "auth_invalid",
      status: 401,
      method: "GET",
      path: "/api/auth/session",
      body: undefined,
    });
  ensureScopes(grantedScopes(session), ["orchestration:read", "orchestration:operate"]);
  const config = await client.server.getConfig();
  const existing =
    options.thread === undefined ? undefined : await client.threads.get(threadId(options.thread));
  if (options.thread !== undefined && !existing) throw missingResource("thread");
  const project =
    existing === undefined
      ? await selectProject(client, options)
      : await client.projects.get(existing.projectId);
  if (!project) throw missingResource("project");
  const modelSelection = selectModel(
    config.providers,
    options,
    existing?.modelSelection ?? project.defaultModelSelection,
    config.settings["defaultModelSelection"],
  );
  const mode = options.mode === undefined ? {} : { runtimeMode: options.mode };
  invocation.errorContext = "dispatch";
  if (existing !== undefined) {
    const target = { threadId: existing.id };
    remember(target);
    if (options.title !== undefined)
      await client.threads.update(existing.id, { title: options.title });
    const turn = await client.threads.startTurn({
      threadId: existing.id,
      text,
      ...mode,
      ...(options.provider === undefined && options.model === undefined ? {} : { modelSelection }),
    });
    const followed = { ...target, turn };
    remember(followed);
    return followed;
  }
  const id = threadId(NodeCrypto.randomUUID());
  remember({ threadId: id });
  const creation = {
    threadId: id,
    projectId: project.id,
    title: options.title ?? "New thread",
    modelSelection,
    ...mode,
  };
  if (options.worktree) {
    const launched = await client.threads.launch({
      ...creation,
      workspace: { type: "worktree", baseRef: options.baseRef ?? defaultWorktreeBaseRef },
      initialMessage: { text },
    });
    remember({ threadId: launched.threadId });
    // A fresh launch owns its initial user message. Follow the server's link,
    // never a run ordinal or a guess about the thread's active run.
    const message = launched.projection.messages.find((candidate) => candidate.role === "user");
    const linkedRun =
      message?.runId ??
      launched.projection.runs.find((run) => run.userMessageId === message?.id)?.id;
    if (linkedRun === undefined || linkedRun === null)
      throw new T3PreconditionError("Launch returned no linked run.");
    const target = { threadId: launched.threadId, runId: linkedRun };
    remember(target);
    return target;
  }
  // Root creation binds the selected project root without asynchronous workspace
  // preparation; startTurn supplies the server-linked TurnHandle.
  const created = await client.threads.create(creation);
  remember({ threadId: created.id });
  const turn = await client.threads.startTurn({ threadId: created.id, text });
  const target = { threadId: created.id, turn };
  remember(target);
  return target;
}

/** For nonwaiting start, wait only until the dispatched message has a run. */
export async function dispatchedRunId(target: FollowTarget): Promise<string> {
  if (target.runId !== undefined) return target.runId;
  if (target.turn === undefined) throw new T3PreconditionError("Missing dispatch handle.");
  if (target.turn.runId !== undefined) return target.turn.runId;
  for await (const _item of target.turn.events()) {
    if (target.turn.runId !== undefined) return target.turn.runId;
  }
  // The final event may settle before the consumer observes the updated handle.
  return (await target.turn.completion).runId;
}
