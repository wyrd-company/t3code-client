// ---
// relationships:
//   implements: command-contract
// ---
import * as NodeCrypto from "node:crypto";
import {
  T3AuthError,
  T3InterruptedError,
  T3PreconditionError,
  ensureScopes,
  grantedScopes,
  schemas,
  threadId,
} from "@wyrd-company/t3code-lib";
import type { SignalScope } from "./signals.ts";
import type { Invocation } from "../context.ts";
import type { FollowTarget } from "./followTarget.ts";
import {
  missingResource,
  selectModel,
  selectProject,
  validateDispatchOptions,
  type DispatchOptions,
} from "./selection.ts";

export interface DispatchTarget extends FollowTarget {
  readonly runtimeMode: string | null;
}

/** The project's current checkout when no explicit base ref is supplied. */
export const defaultWorktreeBaseRef = "HEAD";

/** Resolve all selections and permissions before the first thread mutation. */
export async function dispatchPrompt(
  invocation: Invocation,
  text: string,
  options: DispatchOptions,
  remember: (target: DispatchTarget) => void = () => {},
  signals?: SignalScope,
): Promise<DispatchTarget> {
  validateDispatchOptions(options);
  const preflight = <T>(operation: Promise<T>): Promise<T> =>
    signals === undefined ? operation : signals.until(operation);
  const client = await preflight(invocation.client());
  invocation.errorContext = "connection";
  const session = await preflight(client.auth.sessionState());
  if (!session.authenticated)
    throw new T3AuthError("Authentication required.", {
      code: "auth_invalid",
      status: 401,
      method: "GET",
      path: "/api/auth/session",
      body: undefined,
    });
  ensureScopes(grantedScopes(session), ["orchestration:read", "orchestration:operate"]);
  const config = await preflight(client.server.getConfig());
  const existing =
    options.thread === undefined
      ? undefined
      : await preflight(client.threads.get(threadId(options.thread)));
  if (options.thread !== undefined && !existing) throw missingResource("thread");
  const project =
    existing === undefined
      ? await preflight(selectProject(client, options))
      : await preflight(client.projects.get(existing.projectId));
  if (!project) throw missingResource("project");
  const settings =
    existing === undefined ? await preflight(client.server.getSettings()) : config.settings;
  const modelSelection = selectModel(
    config.providers,
    options,
    existing?.modelSelection ?? project.defaultModelSelection,
    settings["defaultModelSelection"],
  );
  const advertisedMode =
    options.mode === undefined && existing === undefined
      ? settings["defaultRuntimeMode"]
      : undefined;
  const serverMode =
    advertisedMode == null
      ? undefined
      : schemas.orchestrationModel.RuntimeMode.parse(advertisedMode);
  const sentMode = options.mode ?? serverMode;
  const runtimeMode = sentMode ?? null;
  const mode = sentMode === undefined ? {} : { runtimeMode: sentMode };
  if (signals?.interrupted) throw new T3InterruptedError("Operation interrupted.");
  // Past this boundary, retain every mutation receipt and its linked run.
  invocation.errorContext = "dispatch";
  if (existing !== undefined) {
    let target: DispatchTarget = { threadId: existing.id, runtimeMode: null };
    remember(target);
    if (options.title !== undefined)
      await client.threads.update(existing.id, { title: options.title });
    target = { ...target, runtimeMode };
    remember(target);
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
  remember({ threadId: id, runtimeMode });
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
    remember({ threadId: launched.threadId, runtimeMode });
    // A fresh launch owns its initial user message. Follow the server's link,
    // never a run ordinal or a guess about the thread's active run.
    const message = launched.projection.messages.find((candidate) => candidate.role === "user");
    const linkedRun =
      message?.runId ??
      launched.projection.runs.find((run) => run.userMessageId === message?.id)?.id;
    if (linkedRun === undefined || linkedRun === null)
      throw new T3PreconditionError("Launch returned no linked run.");
    const target = { threadId: launched.threadId, runId: linkedRun, runtimeMode };
    remember(target);
    return target;
  }
  // Root creation binds the selected project root without asynchronous workspace
  // preparation; startTurn supplies the server-linked TurnHandle.
  const created = await client.threads.create(creation);
  remember({ threadId: created.id, runtimeMode });
  const turn = await client.threads.startTurn({ threadId: created.id, text });
  const target = { threadId: created.id, turn, runtimeMode };
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
