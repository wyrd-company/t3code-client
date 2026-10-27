// ---
// relationships:
//   verifies: command-line
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  T3ConnectionError,
  T3NotFoundError,
  T3AuthError,
  runId,
  type TurnHandle,
} from "@wyrd-company/t3code-lib";
import { closeDispatchClients, setup } from "../../test/dispatchSetup.ts";
import { dispatchPrompt, dispatchedRunId } from "./dispatch.ts";
import type { FollowTarget } from "./followTarget.ts";

afterEach(closeDispatchClients);
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
  expect(target.runtimeMode).toBeNull();
  expect(fixture.start).toHaveBeenCalledExactlyOnceWith({
    threadId: fixture.existing.id,
    text: "sample prompt",
  });
  expect(target.turn).toBe(fixture.turn);
  expect(fixture.launch).not.toHaveBeenCalled();
});
it.each([
  [{ mode: "future-mode" }, "approval-required", "future-mode"],
  [{}, "approval-required", "approval-required"],
] as const)(
  "new threads send explicit mode or server default: %j",
  async (options, advertised, expected) => {
    const f = setup();
    f.settings.mockResolvedValue({ defaultRuntimeMode: advertised });
    const target = await dispatchPrompt(f.invocation, "prompt", options);
    expect(f.settings).toHaveBeenCalledOnce();
    expect(f.create.mock.calls[0]![0]).toHaveProperty("runtimeMode", expected);
    expect(target.runtimeMode).toBe(expected);
  },
);
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
  expect(fixture.settings).not.toHaveBeenCalled();
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
    expect(target).toEqual({
      threadId: fixture.existing.id,
      runId: "linked-worktree-run",
      runtimeMode: null,
    });
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
it("does not report a mode as sent when continuation metadata update fails first", async () => {
  const f = setup();
  f.update.mockRejectedValue(new Error("sample failure"));
  const known: import("./dispatch.ts").DispatchTarget[] = [];
  await expect(
    dispatchPrompt(
      f.invocation,
      "prompt",
      { thread: f.existing.id, title: "Sample", mode: "future-mode" },
      (target) => known.push(target),
    ),
  ).rejects.toThrow();
  expect(f.start).not.toHaveBeenCalled();
  expect(known.at(-1)?.runtimeMode).toBeNull();
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
  expect(await dispatchedRunId({ threadId: "sample-thread", runId: "already-linked" })).toBe(
    "already-linked",
  );
  expect(
    await dispatchedRunId({
      threadId: "sample-thread",
      turn: { runId: runId("turn-linked") } as TurnHandle,
    }),
  ).toBe("turn-linked");
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
