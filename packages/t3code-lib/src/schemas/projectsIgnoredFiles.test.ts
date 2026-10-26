// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import {
  ProjectIgnoredFile,
  ProjectListIgnoredFilesInput,
  ProjectListIgnoredFilesResult,
} from "./projects.ts";

const file = { path: "sample.env", byteLength: 12 };
const result = { files: [file], truncated: false };

describe("ignored file listing schemas", () => {
  it("infers the public input, file and result types", () => {
    expectTypeOf<ProjectListIgnoredFilesInput["cwd"]>().toEqualTypeOf<string>();
    expectTypeOf<ProjectIgnoredFile["path"]>().toEqualTypeOf<string>();
    expectTypeOf<ProjectIgnoredFile["byteLength"]>().toEqualTypeOf<number>();
    expectTypeOf<ProjectListIgnoredFilesResult["files"]>().toEqualTypeOf<ProjectIgnoredFile[]>();
    expectTypeOf<ProjectListIgnoredFilesResult["truncated"]>().toEqualTypeOf<boolean>();
  });

  it("trims the input cwd and preserves unknown input metadata", () => {
    expect(ProjectListIgnoredFilesInput.parse({ cwd: " /srv/sample ", future: 1 })).toEqual({
      cwd: "/srv/sample",
      future: 1,
    });
  });

  it("rejects a missing, empty, blank or non-string cwd", () => {
    for (const cwd of [undefined, "", "   ", 7, null, {}]) {
      const input = cwd === undefined ? {} : { cwd };
      expect(ProjectListIgnoredFilesInput.safeParse(input).success, String(cwd)).toBe(false);
    }
  });

  it("decodes file entries with a trimmed path, zero byteLength and unknown metadata", () => {
    expect(
      ProjectIgnoredFile.parse({ path: " nested/build.log ", byteLength: 0, mode: "x" }),
    ).toEqual({ path: "nested/build.log", byteLength: 0, mode: "x" });
  });

  it("rejects a malformed path on an otherwise valid file entry", () => {
    for (const path of [undefined, "", "  ", 3, null, ["sample.env"]]) {
      const entry = path === undefined ? { byteLength: 1 } : { path, byteLength: 1 };
      expect(ProjectIgnoredFile.safeParse(entry).success, String(path)).toBe(false);
    }
  });

  it("rejects a malformed byteLength on an otherwise valid file entry", () => {
    for (const byteLength of [undefined, -1, 1.5, "12", null, Number.NaN]) {
      const entry =
        byteLength === undefined ? { path: "sample.env" } : { path: "sample.env", byteLength };
      expect(ProjectIgnoredFile.safeParse(entry).success, String(byteLength)).toBe(false);
    }
  });

  it("leaves out malformed file entries and keeps the valid ones in order", () => {
    const later = { path: "nested/build.log", byteLength: 30 };
    const decoded = ProjectListIgnoredFilesResult.parse({
      files: [file, { path: "", byteLength: 1 }, { path: "a.log", byteLength: -1 }, "x", later],
      truncated: true,
    });
    expect(decoded).toEqual({ files: [file, later], truncated: true });
  });

  it("decodes an empty list and preserves unknown result metadata", () => {
    expect(ProjectListIgnoredFilesResult.parse({ files: [], truncated: false, next: "n" })).toEqual(
      {
        files: [],
        truncated: false,
        next: "n",
      },
    );
  });

  it("requires files as an array and truncated as a boolean", () => {
    for (const value of [
      { truncated: false },
      { files: [file] },
      { files: file, truncated: false },
      { files: null, truncated: false },
      { ...result, truncated: "false" },
      { ...result, truncated: 0 },
      { ...result, truncated: null },
    ]) {
      expect(ProjectListIgnoredFilesResult.safeParse(value).success, JSON.stringify(value)).toBe(
        false,
      );
    }
  });
});
