// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { ProjectReadFileInput, ProjectReadFileResult } from "./projects.ts";
import type { ProjectFilesApi } from "../index.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcPayload, RpcSuccess } from "../rpc/spec.ts";

const input = { cwd: "/srv/sample", relativePath: "optional.txt" };
const result = { relativePath: "optional.txt", contents: "", byteLength: 0, truncated: false };

describe("optional project file reads", () => {
  it("exposes optional booleans through schemas, registry and public facade", () => {
    expectTypeOf<ProjectReadFileInput["allowMissing"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<ProjectReadFileResult["exists"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<RpcPayload<RpcMethods, "projects.readFile">["allowMissing"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<RpcSuccess<RpcMethods, "projects.readFile">["exists"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<Parameters<ProjectFilesApi["read"]>[0]["allowMissing"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<Awaited<ReturnType<ProjectFilesApi["read"]>>["exists"]>().toEqualTypeOf<
      boolean | undefined
    >();
  });

  it("accepts omitted fields and boolean values while preserving future fields", () => {
    expect(ProjectReadFileInput.parse(input)).toEqual(input);
    expect(ProjectReadFileResult.parse(result)).toEqual(result);
    for (const value of [true, false]) {
      const payload = { ...input, allowMissing: value, future: "sample" };
      const response = { ...result, exists: value, future: "sample" };
      expect(ProjectReadFileInput.parse(payload)).toEqual(payload);
      expect(ProjectReadFileResult.parse(response)).toEqual(response);
    }
  });

  it("rejects malformed allowMissing values on otherwise valid inputs", () => {
    for (const allowMissing of [null, "true", 1, {}, []]) {
      expect(ProjectReadFileInput.safeParse({ ...input, allowMissing }).success).toBe(false);
    }
  });

  it("rejects malformed exists values on otherwise valid results", () => {
    for (const exists of [null, "false", 0, {}, []]) {
      expect(ProjectReadFileResult.safeParse({ ...result, exists }).success).toBe(false);
    }
  });
});
