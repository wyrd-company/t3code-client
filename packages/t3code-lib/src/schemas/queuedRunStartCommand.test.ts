// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import {
  malformedQueuedRunStarts,
  queuedRunStart,
} from "../../test/support/queuedRunStartFixtures.ts";
import { ids } from "../../test/support/threadFixtures.ts";
import type { schemas as publicSchemas } from "../index.ts";
import type { CommandId, RunId, ThreadId } from "./common.ts";
import * as schemaBarrel from "./index.ts";
import {
  OrchestrationV2Command,
  QueuedRunStartCommand,
  type OrchestrationV2CommandOfType,
  type OrchestrationV2CommandType,
} from "./orchestration/commands.ts";

describe("public queued-run.start command", () => {
  it("types the queued-run.start member through schemas and union helpers", () => {
    type Expected = {
      [key: string]: unknown;
      type: "queued-run.start";
      commandId: CommandId;
      threadId: ThreadId;
      runId: RunId;
    };
    expectTypeOf<QueuedRunStartCommand>().toEqualTypeOf<Expected>();
    expectTypeOf<OrchestrationV2CommandOfType<"queued-run.start">>().toEqualTypeOf<Expected>();
    expectTypeOf<"queued-run.start">().toExtend<OrchestrationV2CommandType>();
    expectTypeOf<publicSchemas.orchestrationCommands.QueuedRunStartCommand>().toEqualTypeOf<Expected>();
    expect(schemaBarrel.orchestrationCommands.QueuedRunStartCommand).toBe(QueuedRunStartCommand);
  });

  it("accepts a valid command and normalizes ids like its queued-run siblings", () => {
    const value = queuedRunStart();
    expect(QueuedRunStartCommand.parse(value)).toEqual(value);
    expect(OrchestrationV2Command.parse(value)).toEqual(value);
    const padded = queuedRunStart({ runId: `  ${ids.runId}\t` });
    expect(OrchestrationV2Command.parse(padded)).toEqual(value);
  });

  it("preserves unknown command metadata", () => {
    const value = queuedRunStart({ future: "preserved", nested: { level: 1 } });
    expect(OrchestrationV2Command.parse(value)).toEqual(value);
  });

  it("rejects malformed known fields on an otherwise valid command", () => {
    expect(OrchestrationV2Command.safeParse(queuedRunStart()).success).toBe(true);
    for (const [label, value] of malformedQueuedRunStarts) {
      expect(OrchestrationV2Command.safeParse(value).success, label).toBe(false);
      expect(QueuedRunStartCommand.safeParse(value).success, label).toBe(false);
    }
  });
});
