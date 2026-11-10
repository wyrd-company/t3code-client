// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { intervalTask } from "../../test/support/scheduledTaskFixtures.ts";
import { ScheduledTask } from "../schemas/scheduledTask.ts";
import { scheduledTaskUpdateInput } from "./scheduledTaskUpdate.ts";

describe("scheduledTaskUpdateInput", () => {
  it("resends a stored one-time schedule", () => {
    const schedule = { type: "once", runAt: "2030-01-31T07:30:00.000Z" } as const;
    const stored = ScheduledTask.parse({ ...intervalTask, schedule });
    expect(scheduledTaskUpdateInput(stored, { title: "Renamed task" })).toMatchObject({
      title: "Renamed task",
      schedule,
    });
  });

  const bound = { ...intervalTask, threadId: "thread-sample" };

  it("leaves a one-thread mode when the patch unbinds the thread", () => {
    for (const threadMode of [undefined, "continue", "fresh_session"] as const) {
      const stored = ScheduledTask.parse({ ...bound, ...(threadMode ? { threadMode } : {}) });
      expect(scheduledTaskUpdateInput(stored, { threadId: null })).toMatchObject({
        threadId: null,
        threadMode: "new_thread",
      });
    }
  });

  it("sends a mode only when the patch sets one or unbinds the thread", () => {
    const stored = ScheduledTask.parse({ ...bound, threadMode: "continue" });
    expect(scheduledTaskUpdateInput(stored, { title: "Renamed task" })).not.toHaveProperty(
      "threadMode",
    );
    expect(
      scheduledTaskUpdateInput(ScheduledTask.parse(intervalTask), { threadId: null }),
    ).not.toHaveProperty("threadMode");
    expect(
      scheduledTaskUpdateInput(stored, { threadId: null, threadMode: "fresh_session" }),
    ).toMatchObject({ threadMode: "fresh_session" });
  });
});
