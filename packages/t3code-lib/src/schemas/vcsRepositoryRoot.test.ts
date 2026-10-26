// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { VcsListRefsResult } from "./vcs.ts";
import type { VcsApi } from "../index.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";

const result = { refs: [], isRepo: true, hasPrimaryRemote: false, nextCursor: null, totalCount: 0 };

describe("optional repository-root detection", () => {
  it("exposes an optional boolean through schema, registry and public facade", () => {
    expectTypeOf<VcsListRefsResult["isAtRepositoryRoot"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<RpcSuccess<RpcMethods, "vcs.listRefs">["isAtRepositoryRoot"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<Awaited<ReturnType<VcsApi["listRefs"]>>["isAtRepositoryRoot"]>().toEqualTypeOf<
      boolean | undefined
    >();
  });

  it("accepts omission and both booleans while preserving future fields", () => {
    expect(VcsListRefsResult.parse(result)).toEqual(result);
    for (const isAtRepositoryRoot of [true, false]) {
      const response = { ...result, isAtRepositoryRoot, future: "sample" };
      expect(VcsListRefsResult.parse(response)).toEqual(response);
    }
  });

  it("rejects malformed root flags on otherwise valid results", () => {
    for (const isAtRepositoryRoot of [null, "true", 1, {}, []]) {
      expect(VcsListRefsResult.safeParse({ ...result, isAtRepositoryRoot }).success).toBe(false);
    }
  });
});
