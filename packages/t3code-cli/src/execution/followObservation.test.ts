// ---
// relationships:
//   verifies: output-contract
// ---
import { expect, it } from "vite-plus/test";
import { T3DecodeError, schemas, type TurnHandle, runId } from "@wyrd-company/t3code-lib";
import {
  makeProjection,
  makeRun,
  makeSnapshot,
  makeRuntimeRequest,
  items,
  ids,
  parseEvent,
  rawEvent,
} from "../../../t3code-lib/test/support/threadFixtures.ts";
import { FollowObservation } from "./followObservation.ts";

it("updates the selected run from raw library events", () => {
  const observation = new FollowObservation({ threadId: ids.threadId });
  observation.observe({
    kind: "snapshot",
    snapshot: makeSnapshot(makeProjection({ runs: [makeRun()] }), 1),
  });
  observation.observe({
    kind: "event",
    sequence: 2,
    event: parseEvent(rawEvent(2, "run.updated", makeRun({ status: "interrupted" }))),
  });
  expect(observation.result).toMatchObject({ runId: ids.runId, state: "interrupted" });
  expect(observation.outcome?.state).toBe("interrupted");
});

it("throws a library watch decode error", () => {
  const parsed = schemas.orchestrationProjection.OrchestrationV2ThreadProjection.safeParse(null);
  if (parsed.success) throw new Error("Expected invalid projection");
  const error = new T3DecodeError("sample", parsed.error, null);
  expect(() =>
    new FollowObservation({ threadId: ids.threadId }).observe({ kind: "decode-error", error }),
  ).toThrow(error);
});

it("waits for the turn's linked run instead of capturing an unrelated run", () => {
  let adopted: ReturnType<typeof runId> | undefined;
  const turn = {
    get runId() {
      return adopted;
    },
  } as TurnHandle;
  const observation = new FollowObservation({ threadId: ids.threadId, turn });
  const snapshot = makeSnapshot(
    makeProjection({ runs: [makeRun(), makeRun({ id: "run-2", ordinal: 2, status: "queued" })] }),
    1,
  );
  observation.observe({ kind: "snapshot", snapshot });
  expect(observation.result.runId).toBeNull();
  expect(observation.outcome).toBeUndefined();
  adopted = runId("run-2");
  observation.observe({ kind: "synchronized" });
  expect(observation.result).toMatchObject({ runId: "run-2", state: "queued" });
});

it("excludes requests belonging to a different run", () => {
  const observation = new FollowObservation({ threadId: ids.threadId });
  observation.observe({
    kind: "snapshot",
    snapshot: makeSnapshot(
      makeProjection({
        runs: [makeRun()],
        runtimeRequests: [makeRuntimeRequest("approval-1")],
        turnItems: [items.approvalRequest("approval-1", { runId: "run-2" })],
      }),
      1,
    ),
  });
  expect(observation.result.pendingRequests).toEqual([]);
});
