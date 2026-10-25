// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { ThreadMetaUpdate } from "../api/threads.ts";
import { ids } from "../../test/support/threadFixtures.ts";
import { OrchestrationV2Command } from "./orchestration/commands.ts";
import {
  ThreadMetadataUpdatePayload,
  ThreadMetadataUpdateCommand,
} from "./orchestration/commands/thread.ts";

describe("optional expected branch metadata", () => {
  it("exposes nullable string metadata in the public update and command types", () => {
    expectTypeOf<ThreadMetaUpdate["expectedBranch"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<ThreadMetadataUpdateCommand["expectedBranch"]>().toEqualTypeOf<
      string | null | undefined
    >();
  });
  it("preserves omission and null and trims strings across containing schemas", () => {
    for (const metadata of [{}, { expectedBranch: null }, { expectedBranch: " sample-branch " }]) {
      const value = { ...metadata, future: { retained: true } };
      for (const parsed of [
        ThreadMetadataUpdatePayload.parse(value),
        ThreadMetadataUpdateCommand.parse({
          type: "thread.metadata.update",
          commandId: "sample-command",
          threadId: ids.threadId,
          ...value,
        }),
        OrchestrationV2Command.parse({
          type: "thread.metadata.update",
          commandId: "sample-command",
          threadId: ids.threadId,
          ...value,
        }),
      ]) {
        expect(parsed["future"]).toEqual({ retained: true });
        expect(Object.hasOwn(parsed, "expectedBranch")).toBe(
          Object.hasOwn(metadata, "expectedBranch"),
        );
        expect(parsed["expectedBranch"]).toBe(
          metadata.expectedBranch?.trim() ?? metadata.expectedBranch,
        );
      }
    }
  });
  it("rejects malformed values across payload, command and union", () => {
    for (const expectedBranch of ["", "  ", false, true, 1, [], {}]) {
      const value = {
        type: "thread.metadata.update",
        commandId: "sample-command",
        threadId: ids.threadId,
        expectedBranch,
      };
      expect(ThreadMetadataUpdatePayload.safeParse(value).success).toBe(false);
      expect(ThreadMetadataUpdateCommand.safeParse(value).success).toBe(false);
      expect(OrchestrationV2Command.safeParse(value).success).toBe(false);
    }
  });
});
