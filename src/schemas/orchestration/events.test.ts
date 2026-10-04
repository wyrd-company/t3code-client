import { describe, expect, it } from "vite-plus/test";
import { at, events, rawEvent } from "../../../test/support/threadFixtures.ts";
import { OrchestrationEvent } from "./events.ts";

describe("orchestration events", () => {
  it("decodes thread.auto-settle-set", () => {
    const event = OrchestrationEvent.parse(events.autoSettleSet(4, at));
    expect(event).toMatchObject({
      type: "thread.auto-settle-set",
      payload: { autoSettleDisabledAt: at, updatedAt: at },
    });
    expect("unknown" in event).toBe(false);
  });

  it("decodes a reasoning message", () => {
    const event = OrchestrationEvent.parse(
      events.messageSent(5, { messageId: "reasoning-1", role: "reasoning", text: "Thinking" }),
    );
    expect(event).toMatchObject({ payload: { role: "reasoning", text: "Thinking" } });
  });

  it("defaults a missing message turnId to null", () => {
    const event = OrchestrationEvent.parse(
      rawEvent(6, "thread.message-sent", {
        messageId: "message-1",
        role: "user",
        text: "Hello",
        streaming: false,
        createdAt: at,
        updatedAt: at,
      }),
    );
    expect(event).toMatchObject({ payload: { turnId: null } });
  });
});
