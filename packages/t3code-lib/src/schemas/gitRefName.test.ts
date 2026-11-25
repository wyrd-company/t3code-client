// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { GitRefName, trimAsciiWhitespace } from "./common.ts";
import { VcsCreateRefInput, VcsRef } from "./vcs.ts";
import { OrchestrationV2ThreadLaunchWorkspaceStrategy } from "./orchestration/runs.ts";
import { PullRequestListEntry } from "./pullRequestList.ts";
import { ReviewDiffPreviewInput } from "./review.ts";

const nbsp = "\u00a0";
const ideographic = "\u3000";

describe("Git ref names (0.1.12)", () => {
  it("trims ASCII whitespace and keeps Unicode whitespace at the edges", () => {
    expect(trimAsciiWhitespace(" \t\nfeature \r")).toBe("feature");
    expect(GitRefName.parse(` ${nbsp}feature${ideographic}\n`)).toBe(
      `${nbsp}feature${ideographic}`,
    );
    expect(GitRefName.parse("main")).toBe("main");
  });

  it("refuses a name that is only ASCII whitespace", () => {
    for (const blank of ["", " ", "\t\n"]) {
      expect(GitRefName.safeParse(blank).success, JSON.stringify(blank)).toBe(false);
    }
    expect(GitRefName.parse(nbsp)).toBe(nbsp);
  });

  it("keeps Unicode whitespace in refs, launches, pull requests and review inputs", () => {
    const name = `${nbsp}topic`;
    expect(VcsRef.parse({ name, current: false, isDefault: false, worktreePath: null }).name).toBe(
      name,
    );
    expect(VcsCreateRefInput.parse({ cwd: "/sample", refName: ` ${name} ` }).refName).toBe(name);
    expect(
      OrchestrationV2ThreadLaunchWorkspaceStrategy.parse({
        type: "worktree",
        baseRef: `main${nbsp}`,
        branch: name,
      }),
    ).toEqual({ type: "worktree", baseRef: `main${nbsp}`, branch: name });
    expect(ReviewDiffPreviewInput.parse({ cwd: "/sample", baseRef: name }).baseRef).toBe(name);
    const entry = PullRequestListEntry.shape.headBranch.parse(name);
    expect(entry).toBe(name);
  });
});
