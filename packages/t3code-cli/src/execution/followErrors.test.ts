// ---
// relationships:
//   verifies: output-contract
// ---
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { T3AuthError, T3ConnectionError } from "@wyrd-company/t3code-lib";
import {
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
