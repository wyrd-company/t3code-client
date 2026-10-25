// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { ShellApi, ThreadsApi } from "../index.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";
import { makeShellThread } from "../../test/support/threadFixtures.ts";
import {
  OrchestrationV2ThreadShell,
  OrchestrationV2ShellSnapshot,
  OrchestrationV2ArchivedShellSnapshot,
  OrchestrationV2ShellStreamItem,
} from "./orchestration/shell.ts";

const thread = makeShellThread();

describe("optional latest run stop-request shell metadata", () => {
  it("exposes optional boolean through schema, registry and public facades", () => {
    type Expected = boolean | undefined;
    type Snapshot = Awaited<ReturnType<ShellApi["snapshot"]>>;
    type Listed = Awaited<ReturnType<ThreadsApi["list"]>>[number];
    type Archived = RpcSuccess<RpcMethods, "orchestration.getArchivedShellSnapshot">;
    expectTypeOf<OrchestrationV2ThreadShell["latestRunStopRequested"]>().toEqualTypeOf<Expected>();
    expectTypeOf<Snapshot["threads"][number]["latestRunStopRequested"]>().toEqualTypeOf<Expected>();
    expectTypeOf<Listed["latestRunStopRequested"]>().toEqualTypeOf<Expected>();
    expectTypeOf<Archived["threads"][number]["latestRunStopRequested"]>().toEqualTypeOf<Expected>();
  });

  it("preserves both booleans, omission and unknown metadata in snapshots and updates", () => {
    expect(Object.hasOwn(OrchestrationV2ThreadShell.parse(thread), "latestRunStopRequested")).toBe(
      false,
    );
    for (const latestRunStopRequested of [true, false]) {
      const row = { ...thread, latestRunStopRequested, future: "preserved" };
      expect(OrchestrationV2ThreadShell.parse(row)).toEqual(row);
      const snapshot = {
        schemaVersion: 1,
        snapshotSequence: 0,
        projects: [],
        threads: [row],
        archivedThreads: [],
      };
      expect(OrchestrationV2ShellSnapshot.parse(snapshot).threads[0]).toEqual(row);
      expect(OrchestrationV2ArchivedShellSnapshot.parse(snapshot).threads[0]).toEqual(row);
      expect(
        OrchestrationV2ShellStreamItem.parse({
          kind: "thread.updated",
          sequence: 1,
          location: "active",
          thread: row,
        }),
      ).toMatchObject({ thread: row });
    }
  });

  it("rejects non-boolean stop-request metadata on an otherwise valid shell thread", () => {
    expect(OrchestrationV2ThreadShell.safeParse(thread).success).toBe(true);
    for (const latestRunStopRequested of [null, "true", 0, 1, [], {}]) {
      expect(
        OrchestrationV2ThreadShell.safeParse({ ...thread, latestRunStopRequested }).success,
      ).toBe(false);
    }
  });
});
