// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { ProjectsApi } from "../index.ts";
import { RepositoryIdentity, RepositoryOrigin } from "./environment.ts";

const origin = { canonicalKey: "example.invalid/sample/fork" };
const identity = {
  canonicalKey: "example.invalid/sample/canonical",
  locator: {
    source: "git-remote",
    remoteName: "upstream",
    remoteUrl: "https://example.invalid/sample/canonical.git",
  },
  origin,
};

describe("optional repository origin remote URL", () => {
  it("exposes optional string through schema and public project results", () => {
    type Expected = string | undefined;
    expectTypeOf<RepositoryOrigin["remoteUrl"]>().toEqualTypeOf<Expected>();
    expectTypeOf<
      NonNullable<RepositoryIdentity["origin"]>["remoteUrl"]
    >().toEqualTypeOf<Expected>();
    type Created = Awaited<ReturnType<ProjectsApi["create"]>>;
    type Listed = Awaited<ReturnType<ProjectsApi["list"]>>[number];
    type Snapshot = Awaited<ReturnType<ProjectsApi["snapshot"]>>["projects"][number];
    expectTypeOf<
      NonNullable<NonNullable<Created["repositoryIdentity"]>["origin"]>["remoteUrl"]
    >().toEqualTypeOf<Expected>();
    expectTypeOf<
      NonNullable<NonNullable<Listed["repositoryIdentity"]>["origin"]>["remoteUrl"]
    >().toEqualTypeOf<Expected>();
    expectTypeOf<
      NonNullable<NonNullable<Snapshot["repositoryIdentity"]>["origin"]>["remoteUrl"]
    >().toEqualTypeOf<Expected>();
  });

  it("preserves omission and unknown fields and trims a supplied URL", () => {
    expect(RepositoryOrigin.parse(origin)).toEqual(origin);
    expect(RepositoryIdentity.parse(identity)).toEqual(identity);
    const remoteUrl = "https://example.invalid/sample/fork.git";
    const supplied = { ...origin, remoteUrl: `  ${remoteUrl}  `, future: true };
    expect(RepositoryOrigin.parse(supplied)).toEqual({ ...supplied, remoteUrl });
    expect(RepositoryIdentity.parse({ ...identity, origin: supplied }).origin).toEqual({
      ...supplied,
      remoteUrl,
    });
  });

  it("rejects invalid origin URLs on an otherwise valid identity", () => {
    expect(RepositoryIdentity.safeParse(identity).success).toBe(true);
    for (const remoteUrl of [null, "", "   ", 1, false, [], {}]) {
      expect(RepositoryOrigin.safeParse({ ...origin, remoteUrl }).success).toBe(false);
      expect(
        RepositoryIdentity.safeParse({ ...identity, origin: { ...origin, remoteUrl } }).success,
      ).toBe(false);
    }
  });
});
