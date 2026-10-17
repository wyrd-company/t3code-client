// ---
// relationships:
//   verifies: output-contract
// ---
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { makeRuntimeRequest, items, ids } from "../../../t3code-lib/test/support/threadFixtures.ts";
import { setup, target, policy, flush } from "../../test/followSupport.ts";
import { followRun } from "./follow.ts";
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
});
it("fails fast with human-readable questions and request ids, leaving the thread open", async () => {
  const s = setup();
  const promise = followRun(s.invocation, target, policy);
  s.snapshot({
    runtimeRequests: [makeRuntimeRequest("request-1", { kind: "user_input" })],
    turnItems: [items.userInputRequest("request-1")],
  });
  expect(await promise).toMatchObject({
    exitCode: 7,
    pendingRequests: [{ requestId: "request-1", kind: "user-input" }],
  });
  expect(s.stderr.join("")).toContain("request-1");
  expect(s.stderr.join("")).toContain("Proceed?");
  expect(s.respondToApproval).not.toHaveBeenCalled();
  expect(s.interrupt).not.toHaveBeenCalled();
});

it("waits on requests until the deadline when requested", async () => {
  const s = setup();
  const promise = followRun(s.invocation, target, { ...policy, onRequest: "wait", timeoutMs: 1 });
  s.snapshot({ runtimeRequests: [makeRuntimeRequest("request-1")] });
  await flush();
  await vi.advanceTimersByTimeAsync(1);
  expect((await promise).exitCode).toBe(5);
});

it.each(["accept", "reject"] as const)(
  "%s answers approvals once and never answers user input",
  async (approve) => {
    const s = setup();
    const promise = followRun(s.invocation, target, { ...policy, approve });
    const requests = { runtimeRequests: [makeRuntimeRequest("approval-1")] };
    s.snapshot(requests);
    await flush();
    s.snapshot(requests);
    await flush();
    expect(s.respondToApproval).toHaveBeenCalledTimes(1);
    expect(s.respondToApproval).toHaveBeenCalledWith(
      {
        threadId: ids.threadId,
        requestId: "approval-1",
        decision: approve === "accept" ? "accept" : "decline",
      },
      expect.any(AbortSignal),
    );
    s.snapshot({
      runtimeRequests: [makeRuntimeRequest("input-1", { kind: "user_input" })],
      turnItems: [items.userInputRequest("input-1")],
    });
    expect((await promise).exitCode).toBe(7);
    expect(s.respondToApproval).toHaveBeenCalledTimes(1);
  },
);

it("waits until late user-input questions are available before failing fast", async () => {
  const s = setup();
  const promise = followRun(s.invocation, target, policy);
  let finished = false;
  void promise.then(() => {
    finished = true;
  });
  const runtimeRequests = [makeRuntimeRequest("input-1", { kind: "user_input" })];
  s.snapshot({ runtimeRequests });
  await flush();
  expect(finished).toBe(false);
  s.snapshot({ runtimeRequests, turnItems: [items.userInputRequest("input-1")] });
  expect(await promise).toMatchObject({
    exitCode: 7,
    pendingRequests: [{ questions: [{ question: "Proceed?" }] }],
  });
});

it("reports pending questions in JSON without printing them on stderr", async () => {
  const s = setup(true);
  const promise = followRun(s.invocation, target, policy);
  s.snapshot({
    runtimeRequests: [makeRuntimeRequest("input-1", { kind: "user_input" })],
    turnItems: [items.userInputRequest("input-1")],
  });
  s.output.finish(await promise);
  expect(JSON.parse(s.stdout.join(""))).toMatchObject({
    exitCode: 7,
    pendingRequests: [{ requestId: "input-1", questions: [{ question: "Proceed?" }] }],
  });
  expect(s.stderr.join("")).not.toContain("Proceed?");
});

it("never sends an approval decision for a user-input request", async () => {
  const s = setup();
  const promise = followRun(s.invocation, target, {
    ...policy,
    approve: "accept",
    onRequest: "wait",
    timeoutMs: 1,
  });
  s.snapshot({
    runtimeRequests: [makeRuntimeRequest("input-1", { kind: "user_input" })],
    turnItems: [items.userInputRequest("input-1")],
  });
  await flush();
  expect(s.respondToApproval).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect((await promise).exitCode).toBe(5);
});

it("prints a pending approval's prompt and id without answering it by default", async () => {
  const s = setup();
  const promise = followRun(s.invocation, target, policy);
  s.snapshot({
    runtimeRequests: [makeRuntimeRequest("approval-1")],
    turnItems: [items.approvalRequest("approval-1", { prompt: "Allow sample command?" })],
  });
  expect((await promise).exitCode).toBe(7);
  expect(s.stderr.join("")).toContain("approval-1");
  expect(s.stderr.join("")).toContain("Allow sample command?");
  expect(s.respondToApproval).not.toHaveBeenCalled();
  expect(s.interrupt).not.toHaveBeenCalled();
});
