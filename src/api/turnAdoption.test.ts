import { describe, expect, it } from "vite-plus/test";
import {
  at,
  events,
  ids,
  makeMessage,
  makeProjection,
  makeRun,
  parseEvent,
  rawEvent,
} from "../../test/support/threadFixtures.ts";
import { messageId, runId } from "../schemas/common.ts";
import { TurnAdoption } from "./turnAdoption.ts";

const ours = messageId("message-ours");
const runB = runId("run-2");
/** The domain event inside a wire-shaped stream item. */
const ev = (item: Record<string, unknown>) => parseEvent(item["event"] as Record<string, unknown>);

describe("TurnAdoption.seed", () => {
  it("links the run whose userMessageId is ours and settles when it is terminal", () => {
    const running = new TurnAdoption(ours);
    expect(
      running.seed(makeProjection({ runs: [makeRun({ userMessageId: ours })] })),
    ).toBeUndefined();
    expect(running.runId).toBe(ids.runId);

    const finished = new TurnAdoption(ours);
    const outcome = finished.seed(
      makeProjection({
        runs: [makeRun({ userMessageId: ours, status: "completed", completedAt: at })],
        messages: [makeMessage({ id: "message-2", role: "assistant", text: "done" })],
      }),
    );
    expect(outcome).toMatchObject({
      state: "completed",
      runId: ids.runId,
      assistantMessage: { text: "done" },
    });
  });

  it("links through the message record's runId", () => {
    const adoption = new TurnAdoption(ours);
    const projection = makeProjection({
      runs: [makeRun({ id: runB, userMessageId: "message-0", status: "running" })],
      messages: [makeMessage({ id: ours, runId: runB })],
    });
    expect(adoption.seed(projection)).toBeUndefined();
    expect(adoption.runId).toBe(runB);
  });

  it("stays unlinked when nothing names our message", () => {
    const adoption = new TurnAdoption(ours);
    const projection = makeProjection({
      runs: [makeRun({ userMessageId: "message-0", status: "completed" })],
      messages: [makeMessage({ id: ours, runId: null })],
    });
    expect(adoption.seed(projection)).toBeUndefined();
    expect(adoption.runId).toBeUndefined();
    expect(adoption.isOurs(ids.runId)).toBe(false);
  });
});

describe("TurnAdoption.onEvent", () => {
  it("links run.created and run.updated for our message and ignores other runs", () => {
    const adoption = new TurnAdoption(ours);
    adoption.onEvent(ev(events.runCreated(1, { id: "run-other", userMessageId: "m-x" })));
    expect(adoption.runId).toBeUndefined();
    adoption.onEvent(ev(events.runUpdated(2, { userMessageId: ours })));
    expect(adoption.runId).toBe(ids.runId);
    expect(adoption.isOurs(ids.runId)).toBe(true);
    expect(adoption.isOurs(runB)).toBe(false);
  });

  it("links message.updated with a run, ignores one without, and ignores unknown events", () => {
    const adoption = new TurnAdoption(ours);
    adoption.onEvent(ev(events.messageUpdated(1, { id: ours, runId: null })));
    expect(adoption.runId).toBeUndefined();
    adoption.onEvent(ev(events.messageUpdated(2, { id: "m-x", runId: runB })));
    expect(adoption.runId).toBeUndefined();
    adoption.onEvent(parseEvent(rawEvent(3, "something.new", { id: ours, runId: runB })));
    expect(adoption.runId).toBeUndefined();
    adoption.onEvent(ev(events.messageUpdated(4, { id: ours, runId: runB })));
    expect(adoption.runId).toBe(runB);
  });
});
