import { describe, expect, it } from "vite-plus/test";
import {
  at,
  ids,
  items,
  makeMessage,
  makeProjection,
  makeRun,
  makeRuntimeRequest,
  makeShellThread,
} from "../../test/support/threadFixtures.ts";
import type { OrchestrationV2Run } from "../schemas/orchestration/runs.ts";
import {
  activeRun,
  assistantMessageForRun,
  pendingRequests,
  runOutcome,
  threadPhase,
} from "./threadDerived.ts";

const later = "2020-01-01T00:00:05.000Z";

describe("pendingRequests", () => {
  it("lists pending requests oldest first, joined with their timeline rows", () => {
    const projection = makeProjection({
      runtimeRequests: [
        makeRuntimeRequest("r1", { status: "resolved", resolvedAt: later }),
        makeRuntimeRequest("r2", { kind: "user_input", createdAt: later }),
        makeRuntimeRequest("r3", { kind: "file-change" }),
        makeRuntimeRequest("r4", { status: "cancelled" }),
      ],
      turnItems: [
        items.userInputRequest("r2"),
        items.approvalRequest("r3", { requestKind: "file-change" }),
      ],
    });
    const pending = pendingRequests(projection);
    expect(pending.map((r) => [r.kind, r.requestId])).toEqual([
      ["approval", "r3"],
      ["user-input", "r2"],
    ]);
    expect(pending[0]).toMatchObject({
      request: { kind: "file-change" },
      item: { type: "approval_request", requestKind: "file-change" },
    });
    expect(pending[1]?.kind === "user-input" && pending[1].questions.map((q) => q.id)).toEqual([
      "q1",
    ]);
  });

  it("tolerates a request without a timeline row", () => {
    const projection = makeProjection({
      runtimeRequests: [makeRuntimeRequest("r1"), makeRuntimeRequest("r2", { kind: "user_input" })],
    });
    const [approval, input] = pendingRequests(projection);
    expect(approval).toMatchObject({ kind: "approval", item: undefined });
    expect(input).toMatchObject({ kind: "user-input", item: undefined, questions: [] });
  });
});

describe("runOutcome and assistantMessageForRun", () => {
  const completed = (overrides: Record<string, unknown> = {}) =>
    makeRun({ status: "completed", completedAt: at, ...overrides });

  it("is undefined while the run is not terminal", () => {
    const projection = makeProjection({ runs: [makeRun()] });
    expect(runOutcome(projection, projection.runs[0] as OrchestrationV2Run)).toBeUndefined();
  });

  it("prefers the run's finished assistant message over a streaming one", () => {
    const projection = makeProjection({
      runs: [completed()],
      messages: [
        makeMessage({ id: "a1", role: "assistant", text: "final", streaming: false }),
        makeMessage({ id: "a2", role: "assistant", text: "partial", streaming: true }),
        makeMessage({ id: "a3", role: "assistant", text: "other run", runId: "run-9" }),
      ],
    });
    expect(assistantMessageForRun(projection, ids.runId)?.id).toBe("a1");
    const outcome = runOutcome(projection, projection.runs[0] as OrchestrationV2Run);
    expect(outcome).toMatchObject({
      state: "completed",
      runId: ids.runId,
      assistantMessage: { id: "a1" },
      projection,
    });
    expect(outcome?.error).toBeUndefined();
  });

  it("falls back to the last streaming message and to none", () => {
    const streaming = makeProjection({
      messages: [makeMessage({ id: "a2", role: "assistant", text: "partial", streaming: true })],
    });
    expect(assistantMessageForRun(streaming, ids.runId)?.id).toBe("a2");
    expect(assistantMessageForRun(makeProjection(), ids.runId)).toBeUndefined();
  });

  it("takes the error from the run's error item, else the thread's rollback failure when failed", () => {
    const withItem = makeProjection({
      runs: [completed({ status: "failed" })],
      turnItems: [items.error("provider down")],
    });
    expect(runOutcome(withItem, withItem.runs[0] as OrchestrationV2Run)).toMatchObject({
      state: "failed",
      error: "provider down",
    });
    const rolledBack = makeProjection({
      thread: {
        ...makeProjection().thread,
        rollbackFailure: { requestId: "c1", message: "rollback broke" },
      },
      runs: [completed({ status: "failed" })],
    });
    expect(runOutcome(rolledBack, rolledBack.runs[0] as OrchestrationV2Run)?.error).toBe(
      "rollback broke",
    );
    const interrupted = makeProjection({
      thread: { ...makeProjection().thread, rollbackFailure: { requestId: "c1", message: "x" } },
      runs: [completed({ status: "interrupted" })],
    });
    expect(
      runOutcome(interrupted, interrupted.runs[0] as OrchestrationV2Run)?.error,
    ).toBeUndefined();
  });
});

describe("activeRun", () => {
  it("is the highest-ordinal run that has started and is not terminal", () => {
    const projection = makeProjection({
      runs: [
        makeRun({ id: "run-1", status: "completed" }),
        makeRun({ id: "run-3", ordinal: 3, status: "waiting" }),
        makeRun({ id: "run-2", ordinal: 2, status: "running" }),
        makeRun({ id: "run-4", ordinal: 4, status: "cancelled" }),
      ],
    });
    expect(activeRun(projection)?.id).toBe("run-3");
  });

  it("skips a queued run behind the running one", () => {
    const projection = makeProjection({
      runs: [
        makeRun({ id: "run-1", ordinal: 1, status: "running" }),
        makeRun({ id: "run-2", ordinal: 2, status: "queued" }),
      ],
    });
    expect(activeRun(projection)?.id).toBe("run-1");
    expect(activeRun(makeProjection({ runs: [makeRun({ status: "queued" })] }))).toBeUndefined();
    expect(
      activeRun(makeProjection({ runs: [makeRun({ status: "rolled_back" })] })),
    ).toBeUndefined();
    expect(activeRun(makeProjection())).toBeUndefined();
  });
});

describe("threadPhase", () => {
  const request = (kind: string) => ({ id: "r1", kind, createdAt: at });
  it.each([
    [{ pendingRuntimeRequest: request("command") }, "waiting_for_approval"],
    [{ status: "running", pendingRuntimeRequest: request("user_input") }, "waiting_for_input"],
    [{ status: "preparing" }, "starting"],
    [{ status: "queued" }, "starting"],
    [{ status: "starting" }, "starting"],
    [{ status: "running" }, "running"],
    [{ status: "waiting" }, "running"],
    [{ status: "completed" }, "completed"],
    [{ status: "interrupted" }, "completed"],
    [{ status: "cancelled" }, "completed"],
    [{ status: "rolled_back" }, "completed"],
    [{ status: "failed" }, "failed"],
    [{ status: "idle" }, "idle"],
    [{ status: "something_new" }, "idle"],
  ])("%j -> %s", (overrides, expected) => {
    expect(threadPhase(makeShellThread(overrides))).toBe(expected);
  });
});
