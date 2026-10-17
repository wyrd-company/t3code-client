// ---
// relationships:
//   verifies: output-contract
// ---
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { T3InterruptedError } from "@wyrd-company/t3code-lib";
import {
  makeRun,
  makeRuntimeRequest,
  ids,
} from "../../../t3code-lib/test/support/threadFixtures.ts";
import { setup, target, policy, flush } from "../../test/followSupport.ts";
import { followRun } from "./follow.ts";
import { readConversation, type ConversationItem } from "./transcript.ts";
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

it.each(["SIGINT", "SIGTERM"] as const)(
  "first %s aborts a held terminal transcript read and exits 4",
  async (signalName) => {
    const s = setup();
    const listeners = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    let readSignal: AbortSignal | undefined;
    let release: (items: ConversationItem[]) => void = () => {};
    vi.mocked(readConversation).mockImplementationOnce((_, __, signal) => {
      readSignal = signal;
      return new Promise((resolve, reject) => {
        release = resolve;
        signal?.addEventListener("abort", () => reject(new T3InterruptedError("sample")), {
          once: true,
        });
      });
    });
    const promise = followRun(s.invocation, target, policy);
    let finished = false;
    void promise.then(() => {
      finished = true;
    });
    try {
      s.snapshot({ runs: [makeRun({ status: "completed" })] });
      await flush();
      expect(readConversation).toHaveBeenCalledTimes(1);
      process.emit(signalName);
      await flush();
      expect(finished).toBe(true);
      expect(readSignal?.aborted).toBe(true);
      expect(await promise).toMatchObject({
        exitCode: 4,
        state: "completed",
        threadId: ids.threadId,
        runId: ids.runId,
      });
      expect(s.interrupt).not.toHaveBeenCalled();
      expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(
        listeners,
      );
    } finally {
      release([]);
      await promise;
    }
  },
);

it("exits 4 even when a terminal transcript read ignores abort", async () => {
  const s = setup();
  let readSignal: AbortSignal | undefined;
  let release: (items: ConversationItem[]) => void = () => {};
  vi.mocked(readConversation).mockImplementationOnce((_, __, signal) => {
    readSignal = signal;
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  const promise = followRun(s.invocation, target, policy);
  let finished = false;
  void promise.then(() => {
    finished = true;
  });
  try {
    s.snapshot({ runs: [makeRun({ status: "completed" })] });
    await flush();
    process.emit("SIGINT");
    await flush();
    expect(finished).toBe(true);
    expect(readSignal?.aborted).toBe(true);
    expect(await promise).toMatchObject({ exitCode: 4, state: "completed", runId: ids.runId });
    expect(s.interrupt).not.toHaveBeenCalled();
  } finally {
    release([]);
    await promise;
  }
});

it("cancels waiting for client acquisition with known ids", async () => {
  const s = setup();
  let release: () => void = () => {};
  vi.mocked(s.invocation.client).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () =>
          resolve(s.client as unknown as Awaited<ReturnType<typeof s.invocation.client>>);
      }),
  );
  const listeners = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  const promise = followRun(s.invocation, { ...target, runId: ids.runId }, policy);
  let finished = false;
  void promise.then(() => {
    finished = true;
  });
  try {
    await flush();
    process.emit("SIGTERM");
    await flush();
    expect(finished).toBe(true);
    expect(await promise).toMatchObject({
      exitCode: 4,
      state: "unknown",
      threadId: ids.threadId,
      runId: ids.runId,
    });
    expect(s.interrupt).not.toHaveBeenCalled();
    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(listeners);
  } finally {
    release();
    await promise;
  }
});

it("aborts a pending approval response and interrupts the active run with holdQueue", async () => {
  const s = setup();
  let responseSignal: AbortSignal | undefined;
  let release: () => void = () => {};
  s.respondToApproval.mockImplementationOnce((...args: unknown[]) => {
    responseSignal = args[1] as AbortSignal;
    return new Promise<void>((resolve, reject) => {
      release = resolve;
      responseSignal?.addEventListener("abort", () => reject(new T3InterruptedError("sample")), {
        once: true,
      });
    });
  });
  const promise = followRun(s.invocation, target, { ...policy, approve: "accept" });
  let finished = false;
  void promise.then(() => {
    finished = true;
  });
  try {
    s.snapshot({ runtimeRequests: [makeRuntimeRequest("approval-1")] });
    await flush();
    expect(s.respondToApproval).toHaveBeenCalledTimes(1);
    process.emit("SIGINT");
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).toBe(true);
    expect(responseSignal?.aborted).toBe(true);
    expect(await promise).toMatchObject({ exitCode: 4, state: "running", runId: ids.runId });
    expect(s.interrupt).toHaveBeenCalledExactlyOnceWith(ids.threadId, ids.runId, {
      holdQueue: true,
    });
  } finally {
    release();
    await promise;
  }
});

it("cancels a held deadline interrupt request without issuing a second interrupt", async () => {
  const s = setup();
  let release: () => void = () => {};
  s.interrupt.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const promise = followRun(s.invocation, target, {
    ...policy,
    timeoutMs: 1,
    onTimeout: "interrupt",
  });
  let finished = false;
  void promise.then(() => {
    finished = true;
  });
  try {
    s.snapshot();
    await flush();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.interrupt).toHaveBeenCalledTimes(1);
    process.emit("SIGTERM");
    await flush();
    expect(finished).toBe(true);
    expect(await promise).toMatchObject({
      exitCode: 4,
      state: "running",
      threadId: ids.threadId,
      runId: ids.runId,
    });
    expect(s.interrupt).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    release();
    await promise;
  }
});

it("cancels deadline grace immediately on the first signal and keeps the last state", async () => {
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
  await flush();
  expect(await promise).toMatchObject({ exitCode: 4, state: "running", durationMs: 1 });
  expect(s.interrupt).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("aborts an in-flight approval response when the invocation detaches", async () => {
  const s = setup();
  let responseSignal: AbortSignal | undefined;
  let release: () => void = () => {};
  s.respondToApproval.mockImplementationOnce((...args: unknown[]) => {
    responseSignal = args[1] as AbortSignal;
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  const promise = followRun(s.invocation, target, { ...policy, approve: "accept", timeoutMs: 1 });
  try {
    s.snapshot({ runtimeRequests: [makeRuntimeRequest("approval-1")] });
    await flush();
    await vi.advanceTimersByTimeAsync(1);
    expect((await promise).exitCode).toBe(5);
    expect(responseSignal?.aborted).toBe(true);
  } finally {
    release();
    await promise;
  }
});
