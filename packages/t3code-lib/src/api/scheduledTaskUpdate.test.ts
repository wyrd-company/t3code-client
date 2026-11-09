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
});
