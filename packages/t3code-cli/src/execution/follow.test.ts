// ---
// relationships:
//   verifies: output-contract
// ---
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  T3AuthError,
  T3ConnectionError,
  type TurnHandle,
  runOutcome,
  threadId,
  messageId,
  commandId,
  runId,
} from "@wyrd-company/t3code-lib";
import {
  makeProjection,
  makeRun,
  makeMessage,
  ids,
} from "../../../t3code-lib/test/support/threadFixtures.ts";
import { setup, target, policy, flush } from "../../test/followSupport.ts";
import { followRun, followPolicy } from "./follow.ts";

vi.mock("./transcript.ts", () => ({
  readConversation: vi.fn(async () => [{ role: "assistant", text: "fallback" }]),
  lastAssistantMessage: vi.fn(() => "fallback"),
}));
import { readConversation } from "./transcript.ts";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("follow policy", () => {
  it("has no default deadline and parses all explicit policies", () => {
    expect(policy).toEqual({ onTimeout: "detach", onRequest: "fail" });
    expect(
      followPolicy(
        { timeout: "1s", onTimeout: "interrupt", onRequest: "wait", approve: "reject" },
        "detach",
      ),
    ).toEqual({ timeoutMs: 1000, onTimeout: "interrupt", onRequest: "wait", approve: "reject" });
    for (const options of [
      { timeout: "0" },
      { onTimeout: "other" },
      { onRequest: "other" },
      { approve: "other" },
    ])
      expect(() => followPolicy(options, "interrupt")).toThrow();
  });
});

it("detaches at the invocation deadline, keeps ids and active state, and removes signal listeners", async () => {
  const s = setup();
  const listeners = process.listenerCount("SIGINT");
  const promise = followRun(s.invocation, target, { ...policy, timeoutMs: 1000 });
  s.snapshot();
  await flush();
  await vi.advanceTimersByTimeAsync(1000);
  expect(await promise).toMatchObject({
    ...target,
    runId: ids.runId,
    state: "running",
    exitCode: 5,
    durationMs: 1000,
  });
  expect(s.interrupt).not.toHaveBeenCalled();
  expect(s.invocation.errorContext).toBe("run-detach");
  expect(s.stderr.join("")).toContain(ids.threadId);
  expect(process.listenerCount("SIGINT")).toBe(listeners);
});

it.each([true, false])(
  "interrupts with holdQueue and exits 6, terminal confirmation=%s",
  async (confirmed) => {
    const s = setup();
    const promise = followRun(s.invocation, target, {
      ...policy,
      onTimeout: "interrupt",
      timeoutMs: 1000,
    });
    s.snapshot();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.interrupt).toHaveBeenCalledWith(ids.threadId, ids.runId, { holdQueue: true });
    let done = false;
    void promise.then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(done).toBe(false);
    if (confirmed) s.snapshot({ runs: [makeRun({ status: "interrupted" })] });
    else await vi.advanceTimersByTimeAsync(1);
    expect(await promise).toMatchObject({
      exitCode: 6,
      state: confirmed ? "interrupted" : "running",
    });
    expect(s.invocation.errorContext).toBe("run-interrupt");
  },
);

it.each([
  [new T3ConnectionError("closed", "sample"), 8],
  [T3AuthError.insufficientScope("orchestration:operate", "sample"), 9],
])("retains ids when the interrupt request fails (%s)", async (error, code) => {
  const s = setup();
  s.interrupt.mockRejectedValue(error);
  const promise = followRun(s.invocation, target, {
    ...policy,
    onTimeout: "interrupt",
    timeoutMs: 1,
  });
  s.snapshot();
  await flush();
  await vi.advanceTimersByTimeAsync(1);
  expect(await promise).toMatchObject({ ...target, runId: ids.runId, exitCode: code });
});

it.each(["SIGINT", "SIGTERM"] as const)("first %s interrupts and exits 4", async (signal) => {
  const s = setup();
  const promise = followRun(s.invocation, target, policy);
  s.snapshot();
  await flush();
  process.emit(signal);
  await flush();
  expect(s.interrupt).toHaveBeenCalledWith(ids.threadId, ids.runId, { holdQueue: true });
  s.snapshot({ runs: [makeRun({ status: "interrupted" })] });
  expect(await promise).toMatchObject({ exitCode: 4, state: "interrupted" });
});

it("second signal exits immediately with the short final error", async () => {
  const s = setup();
  const exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("exit");
  });
  const promise = followRun(s.invocation, target, policy);
  s.snapshot();
  await flush();
  process.emit("SIGINT");
  await flush();
  expect(() => process.emit("SIGTERM")).toThrow("exit");
  expect(exit).toHaveBeenCalledWith(4);
  expect(s.stderr.at(-1)).toBe("t3c: Operation interrupted.\n");
  await vi.advanceTimersByTimeAsync(5000);
  expect((await promise).exitCode).toBe(4);
});

it.each([false, true])(
  "streams assistant deltas and emits one final result (json=%s)",
  async (json) => {
    const s = setup(json, true);
    const promise = followRun(s.invocation, target, policy);
    s.snapshot();
    await flush();
    s.feed.push({
      kind: "assistant-delta",
      runId: runId("other"),
      itemId: "i" as never,
      messageId: messageId("m"),
      text: "wrong",
      delta: "wrong",
      streaming: true,
    });
    s.feed.push({
      kind: "assistant-delta",
      runId: runId(ids.runId),
      itemId: "i" as never,
      messageId: messageId("m"),
      text: "answer",
      delta: "answer",
      streaming: true,
    });
    s.snapshot({
      runs: [makeRun({ status: "completed" })],
      messages: [makeMessage({ role: "assistant", text: "answer" })],
    });
    s.output.finish(await promise);
    if (json) {
      const rows = s.stdout
        .join("")
        .trim()
        .split("\n")
        .map((row) => JSON.parse(row));
      expect(rows.map((row) => row.type)).toEqual(["assistantDelta", "result"]);
      expect(rows[1]).toMatchObject({ exitCode: 0, assistantMessage: "answer" });
    } else expect(s.stdout.join("")).toBe("answer\n");
  },
);

it("uses the turn handle and prefers its assistant message", async () => {
  const s = setup();
  const projection = makeProjection({
    runs: [makeRun({ status: "completed" })],
    messages: [makeMessage({ role: "assistant", text: "turn answer" })],
  });
  const outcome = runOutcome(projection, projection.runs[0]!)!;
  const turn: TurnHandle = {
    threadId: threadId(ids.threadId),
    runId: runId(ids.runId),
    messageId: messageId("m"),
    commandId: commandId("c"),
    sequence: 0,
    events: () => s.feed.iterator,
    completion: Promise.resolve(outcome),
    interrupt: vi.fn(),
  };
  expect(await followRun(s.invocation, { ...target, turn }, policy)).toMatchObject({
    exitCode: 0,
    assistantMessage: "turn answer",
  });
  expect(s.client.threads.watch).not.toHaveBeenCalled();
  expect(readConversation).not.toHaveBeenCalled();
});

it("falls back to the last assistant transcript item", async () => {
  const s = setup();
  const promise = followRun(s.invocation, target, policy);
  s.snapshot({ runs: [makeRun({ status: "completed" })] });
  expect(await promise).toMatchObject({ exitCode: 0, assistantMessage: "fallback" });
  expect(readConversation).toHaveBeenCalledWith(
    expect.anything(),
    ids.threadId,
    expect.any(AbortSignal),
  );
});

it("returns idle with no run id for a never-run thread", async () => {
  const s = setup();
  const promise = followRun(s.invocation, target, policy);
  s.snapshot({ runs: [] });
  expect(await promise).toMatchObject({ exitCode: 0, state: "idle", runId: null });
  expect(readConversation).not.toHaveBeenCalled();
});

it("captures the active run over a newer queued run and ignores later runs", async () => {
  const s = setup();
  const promise = followRun(s.invocation, target, policy);
  s.snapshot({ runs: [makeRun(), makeRun({ id: "run-2", ordinal: 2, status: "queued" })] });
  await flush();
  s.snapshot({
    runs: [
      makeRun({ status: "completed" }),
      makeRun({ id: "run-2", ordinal: 2, status: "running" }),
    ],
  });
  expect(await promise).toMatchObject({ exitCode: 0, runId: ids.runId, state: "completed" });
});

it("maps watch failure with known ids and releases both signal handlers", async () => {
  const s = setup();
  const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  const promise = followRun(s.invocation, { ...target, runId: ids.runId }, policy);
  s.snapshot();
  await flush();
  s.feed.fail(new T3ConnectionError("closed", "sample"));
  expect(await promise).toMatchObject({ exitCode: 8, ...target, runId: ids.runId });
  expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(before);
});

it("keeps timeout exit 6 when confirmation watch fails after successful interruption", async () => {
  const s = setup();
  const promise = followRun(s.invocation, target, {
    ...policy,
    timeoutMs: 1,
    onTimeout: "interrupt",
  });
  s.snapshot();
  await flush();
  await vi.advanceTimersByTimeAsync(1);
  s.feed.fail(new T3ConnectionError("closed", "sample"));
  expect(await promise).toMatchObject({ exitCode: 6, state: "running", runId: ids.runId });
});

it("a first signal during the timeout grace changes the result to exit 4", async () => {
  const s = setup();
  const promise = followRun(s.invocation, target, {
    ...policy,
    timeoutMs: 1,
    onTimeout: "interrupt",
  });
  s.snapshot();
  await flush();
  await vi.advanceTimersByTimeAsync(1);
  process.emit("SIGINT");
  s.snapshot({ runs: [makeRun({ status: "interrupted" })] });
  expect((await promise).exitCode).toBe(4);
});
