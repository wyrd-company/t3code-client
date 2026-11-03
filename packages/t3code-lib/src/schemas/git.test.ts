import { describe, expect, it } from "vite-plus/test";
import {
  GitActionProgressEvent,
  GitPreparePullRequestThreadResult,
  GitRunStackedActionInput,
} from "./git.ts";

const pullRequest = {
  number: 1,
  title: "Sample",
  url: "https://host.invalid/1",
  baseBranch: "main",
  headBranch: "sample",
  state: "open",
};

describe("git schemas", () => {
  it("assumes a prepared thread is on the head when a server omits the field", () => {
    const decoded = GitPreparePullRequestThreadResult.parse({
      pullRequest,
      branch: "sample",
      worktreePath: null,
    });
    expect(decoded.isOnPullRequestHead).toBe(true);
    expect(
      GitPreparePullRequestThreadResult.parse({
        pullRequest,
        branch: "sample",
        worktreePath: null,
        isOnPullRequestHead: false,
      }).isOnPullRequestHead,
    ).toBe(false);
  });

  it("keeps a progress event of a newer kind", () => {
    const raw = { kind: "newer_kind", actionId: "action-1" };
    expect(GitActionProgressEvent.parse(raw)).toEqual({ unknown: true, raw });
  });

  it("rejects a stacked action outside the build's list, and an empty file list", () => {
    const input = { actionId: "action-1", cwd: "/sample", action: "commit" };
    expect(GitRunStackedActionInput.safeParse(input).success).toBe(true);
    expect(GitRunStackedActionInput.safeParse({ ...input, action: "merge" }).success).toBe(false);
    expect(GitRunStackedActionInput.safeParse({ ...input, filePaths: [] }).success).toBe(false);
  });
});
