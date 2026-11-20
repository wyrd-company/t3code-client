// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { ThreadPullRequestSnapshot, ThreadPullRequestWatch } from "./orchestration/pullRequest.ts";
import { PullRequestActivity, PullRequestDetail, PullRequestSummary } from "./pullRequestDetail.ts";
import { PullRequestDiffResult } from "./pullRequestDiff.ts";
import { PullRequestDiffInput } from "./pullRequestInputs.ts";
import { PullRequestListEntry, PullRequestProviderSummary } from "./pullRequestList.ts";
import { PullRequestMergeMethod, PullRequestOverviewThread } from "./pullRequestParts.ts";
import { PullRequestSetFilesViewedInput } from "./pullRequestWrites.ts";
import {
  PullRequestOperationError,
  PullRequestUnavailableError,
} from "./rpcErrors/pullRequests.ts";

const at = "2026-01-01T00:00:00.000Z";
const ref = { projectId: "project-1", repository: "sample/repo", number: 1 };
const thread = {
  id: "thread-1",
  side: "right",
  isResolved: false,
  isOutdated: false,
  comments: [],
};
const listResult = {
  viewers: {},
  providers: [],
  entries: [],
  errors: [{ projectId: "project-1", projectTitle: "Sample", message: "Not read." }],
  truncated: false,
  nextCursors: {},
};

function rejects(schema: { safeParse(value: unknown): { success: boolean } }, value: unknown) {
  expect(schema.safeParse(value).success).toBe(false);
}

describe("pull request field changes of 0.1.10", () => {
  it("merges by fast-forward where the host allows it", () => {
    expect(PullRequestMergeMethod.parse("fast-forward")).toBe("fast-forward");
    const capabilities = PullRequestDetail.shape.mergeCapabilities;
    expect(
      capabilities.parse({ merge: true, squash: true, rebase: true, "fast-forward": true }),
    ).toMatchObject({ "fast-forward": true });
    rejects(capabilities, { merge: true, squash: true, rebase: true, "fast-forward": "yes" });
  });

  it("reads overview threads apart from review threads", () => {
    const overview = PullRequestOverviewThread.parse({ ...thread, path: null, line: null });
    expect(overview).toMatchObject({ path: null, line: null });
    rejects(PullRequestOverviewThread, { ...thread, path: "src/a.ts", line: null });
    const activity = {
      comments: [],
      commentCount: 0,
      commentsTruncated: false,
      reviewThreads: [],
      overviewThreads: [overview],
      commits: [],
    };
    expect(PullRequestActivity.parse(activity).overviewThreads).toEqual([overview]);
    rejects(PullRequestActivity, { ...activity, overviewThreads: [{ ...thread, path: "a" }] });
  });

  it("reads a required rebase, a merge queue removal and withheld file diffs", () => {
    expect(PullRequestSummary.shape.rebaseRequired.parse(true)).toBe(true);
    rejects(PullRequestListEntry.shape.rebaseRequired, "yes");
    expect(ThreadPullRequestSnapshot.shape.rebaseRequired.parse(false)).toBe(false);
    const removal = { id: "removal-1", removedAt: at, reason: null };
    expect(PullRequestDetail.shape.mergeQueueRemoval.parse(removal)).toEqual(removal);
    rejects(PullRequestDetail.shape.mergeQueueRemoval, { id: "removal-1", removedAt: at });
    const withheld = PullRequestDetail.shape.capabilities.shape.withheldFileDiff;
    expect(withheld.parse(true)).toBe(true);
    rejects(withheld, "yes");
    expect(PullRequestDiffInput.parse({ ...ref, path: "big.lock" })).toMatchObject({
      path: "big.lock",
    });
    rejects(PullRequestDiffInput, { ...ref, path: " " });
    const diff = { patch: "", truncated: true, nextCursor: null, withheldFilesReadable: true };
    expect(PullRequestDiffResult.parse(diff).withheldFilesReadable).toBe(true);
    rejects(PullRequestDiffResult, { ...diff, withheldFilesReadable: "yes" });
  });

  it("names the projects of a host and records the viewed revision of a file", () => {
    const provider = {
      host: "forge.invalid",
      kind: "github",
      searchesOnHost: true,
      projectCount: 1,
      projectIds: ["project-1"],
      configured: true,
      detail: null,
    };
    expect(PullRequestProviderSummary.parse(provider).projectIds).toEqual(["project-1"]);
    rejects(PullRequestProviderSummary, { ...provider, projectIds: [" "] });
    const viewed = {
      ...ref,
      files: [{ path: "src/a.ts", viewed: true, revision: "blob-1" }],
    };
    expect(PullRequestSetFilesViewedInput.parse(viewed).files[0]?.revision).toBe("blob-1");
    rejects(PullRequestSetFilesViewedInput, {
      ...ref,
      files: [{ path: "src/a.ts", viewed: true, revision: "x".repeat(257) }],
    });
  });

  it("reads what a watch records before reporting and whether checks still run", () => {
    const watch = {
      startedAt: at,
      headSha: "abc123",
      failedChecks: [],
      passed: false,
      remarksThrough: at,
      remarkIds: [],
      conflicting: false,
      rebaseRequired: true,
      mergeQueueRemovalId: null,
      wakes: 0,
      awaitingBaseline: "checks",
      checksPending: true,
    };
    expect(ThreadPullRequestWatch.parse(watch)).toMatchObject({
      rebaseRequired: true,
      mergeQueueRemovalId: null,
      awaitingBaseline: "checks",
      checksPending: true,
    });
    rejects(ThreadPullRequestWatch, { ...watch, checksPending: "yes" });
    rejects(ThreadPullRequestWatch, { ...watch, mergeQueueRemovalId: " " });
  });

  it("reads a repository that is no project, and the list result an error carries", () => {
    const unavailable = PullRequestUnavailableError.parse({
      _tag: "PullRequestUnavailableError",
      reason: "repository-without-project",
      repository: "sample/repo",
      host: "forge.invalid",
      listResult,
    });
    expect(unavailable).toMatchObject({
      reason: "repository-without-project",
      repository: "sample/repo",
      host: "forge.invalid",
      listResult: { errors: listResult.errors },
    });
    rejects(PullRequestUnavailableError, {
      _tag: "PullRequestUnavailableError",
      reason: "cli-missing",
      listResult: { entries: [] },
    });
    const failed = PullRequestOperationError.parse({
      _tag: "PullRequestOperationError",
      operation: "list",
      detail: "Failed.",
      listResult,
    });
    expect(failed.listResult?.errors).toEqual(listResult.errors);
  });
});
