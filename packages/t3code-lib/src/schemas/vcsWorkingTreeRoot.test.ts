// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { VcsStatusLocalResult, VcsStatusResult, VcsStatusStreamEvent } from "./vcs.ts";
import type { VcsApi } from "../index.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";

const local = {
  isRepo: true,
  hasPrimaryRemote: false,
  isDefaultRef: true,
  refName: "main",
  hasWorkingTreeChanges: false,
  workingTree: { files: [], insertions: 0, deletions: 0 },
};
const remote = { hasUpstream: false, aheadCount: 0, behindCount: 0, pr: null };

function inputs(workingTree: object) {
  const status = { ...local, workingTree };
  return [
    [VcsStatusLocalResult, status],
    [VcsStatusResult, { ...status, ...remote }],
    [VcsStatusStreamEvent, { _tag: "snapshot", local: status, remote: null }],
    [VcsStatusStreamEvent, { _tag: "localUpdated", local: status }],
  ] as const;
}

describe("optional working-tree roots", () => {
  it("exposes an optional string through schema, registry and public facades", () => {
    expectTypeOf<VcsStatusLocalResult["workingTree"]["rootPath"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<
      RpcSuccess<RpcMethods, "vcs.refreshStatus">["workingTree"]["rootPath"]
    >().toEqualTypeOf<string | undefined>();
    expectTypeOf<Awaited<ReturnType<VcsApi["status"]>>["workingTree"]["rootPath"]>().toEqualTypeOf<
      string | undefined
    >();
    type Event = RpcSuccess<RpcMethods, "subscribeVcsStatus">;
    expectTypeOf<
      Extract<Event, { _tag: "snapshot" }>["local"]["workingTree"]["rootPath"]
    >().toEqualTypeOf<string | undefined>();
    type PublicEvent =
      ReturnType<VcsApi["watchStatus"]> extends AsyncIterable<infer Item> ? Item : never;
    expectTypeOf<
      Extract<PublicEvent, { _tag: "localUpdated" }>["local"]["workingTree"]["rootPath"]
    >().toEqualTypeOf<string | undefined>();
  });

  it("preserves omission, paths with whitespace and future working-tree fields", () => {
    for (const workingTree of [
      local.workingTree,
      { ...local.workingTree, rootPath: "/tmp/sample root ", future: "sample" },
      { ...local.workingTree, rootPath: " " },
    ]) {
      for (const [schema, value] of inputs(workingTree)) expect(schema.parse(value)).toEqual(value);
    }
  });

  it("rejects malformed roots in otherwise valid status responses and events", () => {
    for (const rootPath of [null, true, 1, {}, [], ""]) {
      for (const [schema, value] of inputs({ ...local.workingTree, rootPath })) {
        expect(schema.safeParse(value).success).toBe(false);
      }
    }
  });
});
