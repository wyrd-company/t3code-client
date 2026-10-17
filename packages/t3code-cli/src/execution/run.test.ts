// ---
// relationships:
//   verifies: command-contract
// ---
import * as NodeFSP from "node:fs/promises";
import { Command } from "commander";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { T3ConnectionError, runId, type TurnHandle } from "@wyrd-company/t3code-lib";
import { createInvocation } from "../context.ts";
import { Output, emptyExecution } from "../output.ts";
import { main } from "../main.ts";
import type { CommandSurface } from "../registration.ts";
import { dispatchHandler } from "./run.ts";
import { threadStartHandler } from "./threadStart.ts";
import { threadSendHandler } from "./threadSend.ts";
import { dispatchPrompt, dispatchedRunId } from "./dispatch.ts";
import { readPrompt } from "./prompt.ts";

vi.mock("./dispatch.ts", () => ({ dispatchPrompt: vi.fn(), dispatchedRunId: vi.fn() }));
vi.mock("./prompt.ts", () => ({ readPrompt: vi.fn() }));
afterEach(() => vi.resetAllMocks());
function setup(options: Record<string, unknown> = {}) {
  const stdout: string[] = [],
    stderr: string[] = [];
  const invocation = createInvocation(
    {},
    new Output(
      { stdout: (s) => stdout.push(s), stderr: (s) => stderr.push(s) },
      options["json"] === true,
    ),
  );
  const command = new Command();
  for (const [key, value] of Object.entries(options)) command.setOptionValue(key, value);
  const target = {
    threadId: "sample-thread",
    runtimeMode: null,
    turn: { runId: runId("linked-run") } as TurnHandle,
  };
  const result = {
    ...emptyExecution(10),
    threadId: target.threadId,
    runId: "linked-run",
    state: "completed",
    assistantMessage: "SAMPLE",
  };
  const policy = { onTimeout: "interrupt", onRequest: "fail" } as const;
  const followRun = vi.fn(async () => result);
  const followPolicy = vi.fn(() => policy);
  const follower = vi.fn(async () => ({ followRun, followPolicy }));
  vi.mocked(readPrompt).mockResolvedValue("prompt text");
  vi.mocked(dispatchPrompt).mockResolvedValue(target);
  vi.mocked(dispatchedRunId).mockResolvedValue("linked-run");
  return {
    invocation,
    command,
    target,
    result,
    policy,
    followRun,
    followPolicy,
    follower,
    stdout,
    stderr,
  };
}
it.each(["run", "start", "send"] as const)(
  "%s delegates to the exact follower interface with interrupt default",
  async (kind) => {
    const f = setup({ wait: true, timeout: "2s", onTimeout: "detach", json: true });
    await dispatchHandler(kind, f.follower)(
      kind === "send" ? ["sample-thread", "prompt"] : ["prompt"],
      f.command,
      f.invocation,
    );
    expect(f.followPolicy).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ timeout: "2s", onTimeout: "detach" }),
      "interrupt",
    );
    expect(f.followRun).toHaveBeenCalledExactlyOnceWith(f.invocation, f.target, f.policy);
    expect(JSON.parse(f.stdout.join(""))).toEqual(f.result);
    expect(f.stdout.join("").trim().split("\n")).toHaveLength(1);
    expect(f.stderr.join("")).toBe("Thread: sample-thread\n");
    if (kind === "send")
      expect(dispatchPrompt).toHaveBeenCalledWith(
        f.invocation,
        "prompt text",
        expect.objectContaining({ thread: "sample-thread" }),
        expect.any(Function),
      );
  },
);
it.each([false, true])(
  "nonwaiting thread start prints identity without loading or calling follower (json %j)",
  async (json) => {
    const f = setup({ json });
    await threadStartHandler(f.follower)(["prompt"], f.command, f.invocation);
    expect(f.follower).not.toHaveBeenCalled();
    expect(dispatchedRunId).toHaveBeenCalledExactlyOnceWith(f.target);
    if (json)
      expect(JSON.parse(f.stdout.join(""))).toEqual({
        data: { threadId: "sample-thread", runId: "linked-run", runtimeMode: null },
        exitCode: 0,
      });
    else expect(f.stdout.join("")).toBe("sample-thread\n");
  },
);
it.each([undefined, "silent", "error", "warn", "info", "debug"])(
  "reports the sent mode in JSON and selected progress levels: %j",
  async (logLevel) => {
    const f = setup({ json: true, logLevel });
    const target = { ...f.target, runtimeMode: "future-mode" };
    vi.mocked(dispatchPrompt).mockResolvedValue(target);
    await dispatchHandler("run", f.follower)(["prompt"], f.command, f.invocation);
    expect(JSON.parse(f.stdout.join(""))).toMatchObject({ runtimeMode: "future-mode" });
    expect(f.stderr.join("").includes("Runtime mode: future-mode\n")).toBe(
      logLevel === "info" || logLevel === "debug",
    );
  },
);
it("nonwaiting start reports the mode sent in its data", async () => {
  const f = setup({ json: true });
  vi.mocked(dispatchPrompt).mockResolvedValue({ ...f.target, runtimeMode: "future-mode" });
  await threadStartHandler(f.follower)(["prompt"], f.command, f.invocation);
  expect(JSON.parse(f.stdout.join(""))).toMatchObject({ data: { runtimeMode: "future-mode" } });
});
it("thread send takes its own positional prompt and default interrupt policy", async () => {
  const f = setup();
  await threadSendHandler(f.follower)(["sample-thread", "next prompt"], f.command, f.invocation);
  expect(readPrompt).toHaveBeenCalledExactlyOnceWith("next prompt", undefined);
  expect(f.followPolicy).toHaveBeenCalledWith({}, "interrupt");
  expect(f.stdout.join("")).toBe("SAMPLE\n");
});
it.each([false, true])(
  "retains known ids after a dispatch/follow failure (wait %j)",
  async (wait) => {
    const f = setup({ wait, json: true });
    vi.mocked(dispatchPrompt).mockImplementation(async (invocation, _text, _options, remember) => {
      invocation.errorContext = "dispatch";
      remember?.(f.target);
      throw new T3ConnectionError("closed", "sample failure");
    });
    await threadStartHandler(f.follower)(["prompt"], f.command, f.invocation);
    const result = JSON.parse(f.stdout.join(""));
    expect(wait ? result : result.data).toMatchObject({
      threadId: "sample-thread",
      runId: "linked-run",
    });
    expect(result.exitCode).toBe(8);
    expect(dispatchPrompt).toHaveBeenCalledOnce();
  },
);
it("prints recovery identity when dispatch fails after the server may have created a thread", async () => {
  const f = setup();
  vi.mocked(dispatchPrompt).mockImplementation(async (_invocation, _text, _options, remember) => {
    remember?.(f.target);
    throw new Error("sample failure");
  });
  await dispatchHandler("run", f.follower)(["prompt"], f.command, f.invocation);
  expect(f.stdout).toEqual([]);
  expect(f.stderr.join("")).toBe("Thread: sample-thread\nt3c: Command failed.\n");
});
it("retains the sent mode when following fails", async () => {
  const f = setup({ json: true });
  vi.mocked(dispatchPrompt).mockResolvedValue({ ...f.target, runtimeMode: "future-mode" });
  f.followRun.mockRejectedValue(new Error("sample failure"));
  await dispatchHandler("run", f.follower)(["prompt"], f.command, f.invocation);
  expect(JSON.parse(f.stdout.join(""))).toMatchObject({
    threadId: "sample-thread",
    runId: "linked-run",
    runtimeMode: "future-mode",
    exitCode: 1,
  });
});
it("rejects invalid policy before dispatch", async () => {
  const f = setup();
  f.followPolicy.mockImplementation(() => {
    throw new Error("invalid policy");
  });
  await expect(
    dispatchHandler("run", f.follower)(["prompt"], f.command, f.invocation),
  ).rejects.toThrow("invalid policy");
  expect(dispatchPrompt).not.toHaveBeenCalled();
});
it("commander rejects every existing-thread relocation flag before handler dispatch", async () => {
  const surface = JSON.parse(
    await NodeFSP.readFile(
      new URL("../../../../specifications/assets/cli-surface.json", import.meta.url),
      "utf8",
    ),
  ) as CommandSurface;
  for (const path of [["run"], ["thread", "start"]]) {
    for (const relocation of [
      ["--project", "sample"],
      ["--project-path", "/sample"],
      ["--worktree"],
      ["--worktree", "--base-ref", "main"],
    ]) {
      const handler = vi.fn(async () => {});
      const result = await main(
        [...path, "prompt", "--thread", "sample-thread", ...relocation],
        surface,
        { stdout() {}, stderr() {} },
        { [path.join(" ")]: handler },
      );
      expect(result).toBe(2);
      expect(handler).not.toHaveBeenCalled();
    }
  }
});
