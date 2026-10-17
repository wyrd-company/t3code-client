// ---
// relationships:
//   verifies: output-contract
// ---
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  T3AuthError,
  T3ConnectionError,
  type TurnHandle,
  type TurnOutcome,
  runOutcome,
  threadId,
  runId,
  messageId,
  commandId,
} from "@wyrd-company/t3code-lib";
import {
  makeProjection,
  makeRun,
  makeRuntimeRequest,
  ids,
} from "../../../t3code-lib/test/support/threadFixtures.ts";
import { setup, target, policy, flush } from "../../test/followSupport.ts";
import { followRun } from "./follow.ts";
import { readConversation } from "./transcript.ts";
vi.mock("./transcript.ts", () => ({
  readConversation: vi.fn(async () => []),
  lastAssistantMessage: vi.fn(() => null),
}));
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it.each([
  ["completed", 0],
  ["failed", 3],
  ["rolled_back", 3],
  ["cancelled", 4],
  ["interrupted", 4],
])("maps terminal state %s to exit %s", async (state, code) => {
  const s = setup();
  const promise = followRun(s.invocation, target, policy);
  s.snapshot({ runs: [makeRun({ status: state })] });
  expect(await promise).toMatchObject({ state, exitCode: code, runId: ids.runId });
});

it("has no implicit run deadline", async () => {
  const s = setup();
  const promise = followRun(s.invocation, target, policy);
  let done = false;
  void promise.then(() => {
    done = true;
  });
  s.snapshot();
  await flush();
  await vi.advanceTimersByTimeAsync(3_600_000);
  expect(done).toBe(false);
  expect(s.interrupt).not.toHaveBeenCalled();
  s.snapshot({ runs: [makeRun({ status: "completed" })] });
  expect((await promise).exitCode).toBe(0);
});

it("measures the deadline from invocation start rather than follow start", async () => {
  const s = setup();
  await vi.advanceTimersByTimeAsync(900);
  const promise = followRun(s.invocation, target, { ...policy, timeoutMs: 1000 });
  s.snapshot();
  await flush();
  await vi.advanceTimersByTimeAsync(100);
  expect(await promise).toMatchObject({ exitCode: 5, durationMs: 1000 });
});

it("starts the five-second grace after the interrupt request resolves", async () => {
  const s = setup();
  let acknowledge: () => void = () => {};
  s.interrupt.mockImplementation(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
  );
  const promise = followRun(s.invocation, target, {
    ...policy,
    timeoutMs: 1,
    onTimeout: "interrupt",
  });
  let done = false;
  void promise.then(() => {
    done = true;
  });
  s.snapshot();
  await flush();
  await vi.advanceTimersByTimeAsync(1);
  await vi.advanceTimersByTimeAsync(6000);
  expect(done).toBe(false);
  acknowledge();
  await flush();
  await vi.advanceTimersByTimeAsync(4999);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect((await promise).exitCode).toBe(6);
});

it("retains ids on transcript fallback failure", async () => {
  const s = setup();
  vi.mocked(readConversation).mockRejectedValueOnce(new T3ConnectionError("closed", "sample"));
  const promise = followRun(s.invocation, target, policy);
  s.snapshot({ runs: [makeRun({ status: "completed" })] });
  expect(await promise).toMatchObject({
    ...target,
    runId: ids.runId,
    state: "completed",
    exitCode: 8,
  });
});

it("retains ids on approval response failure", async () => {
  const s = setup();
  s.respondToApproval.mockRejectedValueOnce(
    T3AuthError.insufficientScope("orchestration:operate", "sample"),
  );
  const promise = followRun(s.invocation, target, { ...policy, approve: "accept" });
  s.snapshot({ runtimeRequests: [makeRuntimeRequest("approval-1")] });
  expect(await promise).toMatchObject({ ...target, runId: ids.runId, exitCode: 9 });
});

it("selects the latest run when none is active and honors an explicit run", async () => {
  for (const explicit of [false, true]) {
    const s = setup();
    const promise = followRun(
      s.invocation,
      { ...target, ...(explicit ? { runId: ids.runId } : {}) },
      policy,
    );
    s.snapshot({
      runs: [
        makeRun({ status: "failed" }),
        makeRun({ id: "run-2", ordinal: 2, status: "completed" }),
      ],
    });
    expect(await promise).toMatchObject({
      runId: explicit ? ids.runId : "run-2",
      exitCode: explicit ? 3 : 0,
    });
  }
});

it("does not mutate a detached result when the turn completes later", async () => {
  const s = setup();
  let complete: (outcome: TurnOutcome) => void = () => {};
  const completion = new Promise<TurnOutcome>((resolve) => {
    complete = resolve;
  });
  const turn: TurnHandle = {
    threadId: threadId(ids.threadId),
    runId: runId(ids.runId),
    messageId: messageId("m"),
    commandId: commandId("c"),
    sequence: 0,
    events: () => s.feed.iterator,
    completion,
    interrupt: vi.fn(),
  };
  const promise = followRun(s.invocation, { ...target, turn }, { ...policy, timeoutMs: 1 });
  s.snapshot();
  await flush();
  await vi.advanceTimersByTimeAsync(1);
  const result = await promise;
  const projection = makeProjection({ runs: [makeRun({ status: "completed" })] });
  complete(runOutcome(projection, projection.runs[0]!)!);
  await flush();
  expect(result).toMatchObject({ exitCode: 5, state: "running" });
});

it("retains the newly linked turn run id on a completion failure", async () => {
  const s = setup();
  let linked: ReturnType<typeof runId> | undefined;
  let fail: (error: unknown) => void = () => {};
  const completion = new Promise<TurnOutcome>((_, reject) => {
    fail = reject;
  });
  const turn: TurnHandle = {
    threadId: threadId(ids.threadId),
    get runId() {
      return linked;
    },
    messageId: messageId("m"),
    commandId: commandId("c"),
    sequence: 0,
    events: () => s.feed.iterator,
    completion,
    interrupt: vi.fn(),
  };
  const promise = followRun(s.invocation, { ...target, turn }, policy);
  s.snapshot();
  await flush();
  linked = runId(ids.runId);
  fail(new T3ConnectionError("closed", "sample"));
  expect(await promise).toMatchObject({ exitCode: 8, runId: ids.runId, threadId: ids.threadId });
});

it("preserves deadlines longer than the Node timer limit", async () => {
  const s = setup();
  const timeoutMs = 30 * 24 * 3_600_000;
  const timer = vi.spyOn(globalThis, "setTimeout");
  const promise = followRun(s.invocation, target, { ...policy, timeoutMs });
  let done = false;
  void promise.then(() => {
    done = true;
  });
  s.snapshot();
  await flush();
  expect(timer).toHaveBeenLastCalledWith(expect.any(Function), 2_147_483_647);
  await vi.advanceTimersByTimeAsync(2_147_483_648);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(timeoutMs - 2_147_483_648);
  expect(await promise).toMatchObject({ exitCode: 5, durationMs: timeoutMs });
});
