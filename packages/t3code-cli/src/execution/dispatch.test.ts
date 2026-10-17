// ---
// relationships:
//   verifies: command-contract
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  T3Client,
  T3ConnectionError,
  T3NotFoundError,
  T3AuthError,
  threadId,
  projectId,
  providerInstanceId,
  runId,
  messageId,
  commandId,
  type TurnHandle,
  type OrchestrationProjectShell,
  type OrchestrationV2ThreadShell,
} from "@wyrd-company/t3code-lib";
import { createInvocation } from "../context.ts";
import { Output } from "../output.ts";
import { dispatchPrompt, dispatchedRunId } from "./dispatch.ts";
import type { FollowTarget } from "./followTarget.ts";

const clients: T3Client[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  vi.restoreAllMocks();
});
function setup() {
  const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
  clients.push(client);
  const invocation = createInvocation({}, new Output({ stdout() {}, stderr() {} }));
  vi.spyOn(invocation, "client").mockResolvedValue(client);
  const project = {
    id: projectId("sample-project"),
    workspaceRoot: "/sample",
    defaultModelSelection: {
      instanceId: providerInstanceId("sample-provider"),
      model: "sample-model",
    },
  } as OrchestrationProjectShell;
  const existing = {
    id: threadId("sample-thread"),
    projectId: project.id,
    modelSelection: project.defaultModelSelection,
  } as OrchestrationV2ThreadShell;
  const session = vi.spyOn(client.auth, "sessionState").mockResolvedValue({
    authenticated: true,
    scopes: ["orchestration:read", "orchestration:operate"],
  } as Awaited<ReturnType<typeof client.auth.sessionState>>);
  const config = vi.spyOn(client.server, "getConfig").mockResolvedValue({
    settings: {},
    providers: [
      {
        instanceId: "sample-provider",
        enabled: true,
        installed: true,
        status: "ready",
        models: [{ slug: "sample-model" }, { slug: "custom-model", isCustom: true }],
      },
    ],
  } as Awaited<ReturnType<typeof client.server.getConfig>>);
  const getProject = vi.spyOn(client.projects, "get").mockResolvedValue(project);
  vi.spyOn(client.projects, "ensureScratch").mockResolvedValue({ projectId: project.id });
  const getThread = vi.spyOn(client.threads, "get").mockResolvedValue(existing);
  const create = vi.spyOn(client.threads, "create").mockResolvedValue(existing);
  const update = vi.spyOn(client.threads, "update").mockResolvedValue();
  const launch = vi.spyOn(client.threads, "launch");
  const turn = {
    threadId: existing.id,
    runId: runId("linked-run"),
    messageId: messageId("sent-message"),
    commandId: commandId("sent-command"),
  } as TurnHandle;
  const start = vi.spyOn(client.threads, "startTurn").mockResolvedValue(turn);
  return {
    invocation,
    client,
    project,
    existing,
    session,
    config,
    getProject,
    getThread,
    create,
    update,
    launch,
    start,
    turn,
  };
}
it("creates at project root and starts exactly one server-linked turn without supplying a mode", async () => {
  const fixture = setup();
  const target = await dispatchPrompt(fixture.invocation, "sample prompt", {});
  expect(fixture.create).toHaveBeenCalledOnce();
  expect(fixture.create.mock.calls[0]![0]).toMatchObject({
    projectId: fixture.project.id,
    title: "New thread",
    modelSelection: fixture.project.defaultModelSelection,
  });
  expect(fixture.create.mock.calls[0]![0]).not.toHaveProperty("runtimeMode");
  expect(fixture.start).toHaveBeenCalledExactlyOnceWith({
    threadId: fixture.existing.id,
    text: "sample prompt",
  });
  expect(target.turn).toBe(fixture.turn);
  expect(fixture.launch).not.toHaveBeenCalled();
});
it("continuation retains project/workspace and applies selected model, mode and title", async () => {
  const fixture = setup();
  const target = await dispatchPrompt(fixture.invocation, "next prompt", {
    thread: fixture.existing.id,
    provider: "sample-provider",
    model: "custom-model",
    mode: "future-mode",
    title: "Sample title",
  });
  expect(fixture.create).not.toHaveBeenCalled();
  expect(fixture.launch).not.toHaveBeenCalled();
  expect(fixture.update).toHaveBeenCalledExactlyOnceWith(fixture.existing.id, {
    title: "Sample title",
  });
  expect(fixture.start).toHaveBeenCalledExactlyOnceWith({
    threadId: fixture.existing.id,
    text: "next prompt",
    modelSelection: { instanceId: "sample-provider", model: "custom-model" },
    runtimeMode: "future-mode",
  });
  expect(target.turn).toBe(fixture.turn);
});
it("unqualified continuation preserves the existing model and mode", async () => {
  const fixture = setup();
  await dispatchPrompt(fixture.invocation, "next prompt", { thread: fixture.existing.id });
  expect(fixture.start).toHaveBeenCalledExactlyOnceWith({
    threadId: fixture.existing.id,
    text: "next prompt",
  });
  expect(fixture.update).not.toHaveBeenCalled();
});
it.each([undefined, "sample-base"])(
  "launches worktree with initial message and exact linked run (base %j)",
  async (baseRef) => {
    const fixture = setup();
    fixture.launch.mockResolvedValue({
      threadId: fixture.existing.id,
      projection: {
        messages: [{ id: "initial-message", role: "user", runId: "linked-worktree-run" }],
        runs: [{ id: "unrelated-run" }],
      },
    } as Awaited<ReturnType<typeof fixture.client.threads.launch>>);
    const target = await dispatchPrompt(fixture.invocation, "worktree prompt", {
      worktree: true,
      ...(baseRef === undefined ? {} : { baseRef }),
    });
    expect(target).toEqual({ threadId: fixture.existing.id, runId: "linked-worktree-run" });
    expect(fixture.launch.mock.calls[0]![0]).toMatchObject({
      workspace: { type: "worktree", baseRef: baseRef ?? "HEAD" },
      initialMessage: { text: "worktree prompt" },
    });
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.start).not.toHaveBeenCalled();
  },
);
it.each(["scope", "auth", "connection", "project", "thread", "model", "relocation"])(
  "pre-dispatch %s failure creates no thread or turn",
  async (fault) => {
    const f = setup();
    let options = {};
    if (fault === "scope")
      f.session.mockResolvedValue({
        authenticated: true,
        scopes: ["orchestration:read"],
      } as Awaited<ReturnType<typeof f.client.auth.sessionState>>);
    if (fault === "auth")
      f.session.mockResolvedValue({
        authenticated: false,
        scopes: ["orchestration:read", "orchestration:operate"],
      } as Awaited<ReturnType<typeof f.client.auth.sessionState>>);
    if (fault === "connection")
      f.config.mockRejectedValue(new T3ConnectionError("closed", "sample"));
    if (fault === "project") {
      f.getProject.mockResolvedValue(undefined);
      options = { project: "missing" };
    }
    if (fault === "thread") {
      f.getThread.mockResolvedValue(undefined);
      options = { thread: "missing" };
    }
    if (fault === "model") options = { model: "missing" };
    if (fault === "relocation") options = { thread: "sample-thread", project: "sample-project" };
    const known = vi.fn();
    await expect(dispatchPrompt(f.invocation, "sample prompt", options, known)).rejects.toThrow();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.launch).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
    expect(known).not.toHaveBeenCalled();
  },
);
it("maps resource and scope preflight errors by library class", async () => {
  const f = setup();
  f.getProject.mockResolvedValue(undefined);
  await expect(
    dispatchPrompt(f.invocation, "prompt", { project: "missing" }),
  ).rejects.toBeInstanceOf(T3NotFoundError);
  f.session.mockResolvedValue({ authenticated: true, scopes: [] } as unknown as Awaited<
    ReturnType<typeof f.client.auth.sessionState>
  >);
  await expect(dispatchPrompt(f.invocation, "prompt", {})).rejects.toBeInstanceOf(T3AuthError);
});
it("retains known identity and never retries an ambiguous launch", async () => {
  const f = setup();
  f.launch.mockRejectedValue(new T3ConnectionError("closed", "sample"));
  const known: FollowTarget[] = [];
  await expect(
    dispatchPrompt(f.invocation, "prompt", { worktree: true }, (target) => known.push(target)),
  ).rejects.toBeInstanceOf(T3ConnectionError);
  expect(f.launch).toHaveBeenCalledOnce();
  expect(known[0]?.threadId).toBeTruthy();
});
it("nonwaiting start observes the TurnHandle's linked run rather than active/latest run", async () => {
  let linked: ReturnType<typeof runId> | undefined;
  const turn = {
    get runId() {
      return linked;
    },
    async *events() {
      linked = runId("linked-after-dispatch");
      yield { kind: "caught-up" };
    },
  } as unknown as TurnHandle;
  expect(await dispatchedRunId({ threadId: "sample-thread", turn })).toBe("linked-after-dispatch");
});
