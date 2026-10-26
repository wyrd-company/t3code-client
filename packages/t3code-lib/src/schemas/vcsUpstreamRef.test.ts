// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { VcsListRefsResult, VcsRef } from "./vcs.ts";
import type { VcsApi } from "../index.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";

const ref = { name: "main", current: true, isDefault: true, worktreePath: null };
const result = {
  refs: [ref],
  isRepo: true,
  hasPrimaryRemote: false,
  nextCursor: null,
  totalCount: 1,
};

describe("optional upstream references", () => {
  it("exposes an optional string through schema, registry and public facade", () => {
    expectTypeOf<VcsRef["upstreamRef"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<
      RpcSuccess<RpcMethods, "vcs.listRefs">["refs"][number]["upstreamRef"]
    >().toEqualTypeOf<string | undefined>();
    expectTypeOf<
      Awaited<ReturnType<VcsApi["listRefs"]>>["refs"][number]["upstreamRef"]
    >().toEqualTypeOf<string | undefined>();
  });

  it("accepts omission and full refs while preserving future fields", () => {
    expect(VcsListRefsResult.parse(result)).toEqual(result);
    const tracked = { ...ref, upstreamRef: "refs/remotes/origin/main", future: "sample" };
    expect(VcsRef.parse(tracked)).toEqual(tracked);
    expect(VcsListRefsResult.parse({ ...result, refs: [tracked] }).refs).toEqual([tracked]);
  });

  it("rejects malformed upstream refs on otherwise valid references", () => {
    for (const upstreamRef of [null, true, 1, {}, [], "", "   "]) {
      expect(
        VcsListRefsResult.safeParse({ ...result, refs: [{ ...ref, upstreamRef }] }).success,
      ).toBe(false);
    }
  });
});
