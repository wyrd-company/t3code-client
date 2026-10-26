// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import {
  malformedThreadStops,
  threadStop,
  threadStopReasons,
} from "../../test/support/threadStopFixtures.ts";
import type { schemas as publicSchemas } from "../index.ts";
import type { CommandId, ThreadId } from "./common.ts";
import * as schemaBarrel from "./index.ts";
import {
  OrchestrationV2Command,
  ThreadStopCommand,
  type OrchestrationV2CommandOfType,
  type OrchestrationV2CommandType,
} from "./orchestration/commands.ts";

describe("public thread.stop command", () => {
  it("types the thread.stop member through schemas and union helpers", () => {
    type Expected = {
      [key: string]: unknown;
      type: "thread.stop";
      commandId: CommandId;
      threadId: ThreadId;
      reason?: string | undefined;
    };
    expectTypeOf<ThreadStopCommand>().toEqualTypeOf<Expected>();
    expectTypeOf<OrchestrationV2CommandOfType<"thread.stop">>().toEqualTypeOf<Expected>();
    expectTypeOf<"thread.stop">().toExtend<OrchestrationV2CommandType>();
    expectTypeOf<publicSchemas.orchestrationCommands.ThreadStopCommand>().toEqualTypeOf<Expected>();
    expect(schemaBarrel.orchestrationCommands.ThreadStopCommand).toBe(ThreadStopCommand);
  });

  it("accepts omitted, empty, padded and arbitrary reasons unchanged", () => {
    for (const fields of threadStopReasons) {
      const value = threadStop(fields);
      expect(ThreadStopCommand.parse(value)).toEqual(value);
      const parsed = OrchestrationV2Command.parse(value);
      expect(parsed).toEqual(value);
      expect(Object.hasOwn(parsed, "reason")).toBe(Object.hasOwn(fields, "reason"));
    }
  });

  it("preserves unknown command metadata", () => {
    const value = threadStop({ reason: "sample", future: "preserved", nested: { level: 1 } });
    expect(OrchestrationV2Command.parse(value)).toEqual(value);
  });

  it("rejects malformed known fields on an otherwise valid command", () => {
    expect(OrchestrationV2Command.safeParse(threadStop()).success).toBe(true);
    for (const [label, value] of malformedThreadStops) {
      expect(OrchestrationV2Command.safeParse(value).success, label).toBe(false);
      expect(ThreadStopCommand.safeParse(value).success, label).toBe(false);
    }
  });
});
