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

describe("optional provider error code shell metadata", () => {
  it("exposes optional nullable string through schema, registry and public facades", () => {
    type Expected = string | null | undefined;
    type Snapshot = Awaited<ReturnType<ShellApi["snapshot"]>>;
    type Listed = Awaited<ReturnType<ThreadsApi["list"]>>[number];
    type Archived = RpcSuccess<RpcMethods, "orchestration.getArchivedShellSnapshot">;
    expectTypeOf<OrchestrationV2ThreadShell["lastErrorCode"]>().toEqualTypeOf<Expected>();
    expectTypeOf<Snapshot["threads"][number]["lastErrorCode"]>().toEqualTypeOf<Expected>();
    expectTypeOf<Listed["lastErrorCode"]>().toEqualTypeOf<Expected>();
    expectTypeOf<Archived["threads"][number]["lastErrorCode"]>().toEqualTypeOf<Expected>();
  });

  it("preserves strings and null, omission and unknown metadata in snapshots and updates", () => {
    expect(Object.hasOwn(OrchestrationV2ThreadShell.parse(thread), "lastErrorCode")).toBe(false);
    for (const lastErrorCode of ["sample_code", "", null]) {
      const row = { ...thread, lastErrorCode, future: "preserved" };
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

  it("rejects non-string and non-null provider error code metadata on an otherwise valid shell thread", () => {
    expect(OrchestrationV2ThreadShell.safeParse(thread).success).toBe(true);
    for (const lastErrorCode of [true, false, 0, 1, [], {}]) {
      expect(OrchestrationV2ThreadShell.safeParse({ ...thread, lastErrorCode }).success).toBe(
        false,
      );
    }
  });
});
