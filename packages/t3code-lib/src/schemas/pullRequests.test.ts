// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import {
  PullRequestChangeBreakdown,
  PullRequestDetail,
  PullRequestListInput,
  PullRequestReviewGuideResult,
  PullRequestRoutingResult,
  PullRequestStack,
  PullRequestThreadCommentsResult,
  PullRequestDiffFileContentsInput,
  PullRequestFilterOptionsInput,
} from "./pullRequests.ts";
import { decodeRpcErrorRecord, isRpcErrorOfTag } from "./rpcErrors.ts";

const createdAt = "2026-01-01T00:00:00.000Z";
const actor = { login: "sample", name: null, avatarUrl: null };

describe("pull request inputs", () => {
  it("takes only the contract's listing values and bounds", () => {
    expect(PullRequestListInput.safeParse({ state: "open", limit: 500 }).success).toBe(true);
    expect(PullRequestListInput.safeParse({ state: "draft" }).success).toBe(false);
    expect(PullRequestListInput.safeParse({ state: "open", limit: 501 }).success).toBe(false);
    expect(
      PullRequestListInput.safeParse({ state: "open", filters: { draft: "maybe" } }).success,
    ).toBe(false);
    expect(
      PullRequestListInput.safeParse({
        state: "open",
        filters: { labels: Array.from({ length: 11 }, () => ["sample"]) },
      }).success,
    ).toBe(false);
    expect(PullRequestListInput.safeParse({ state: "open", query: "x".repeat(201) }).success).toBe(
      false,
    );
    expect(PullRequestFilterOptionsInput.safeParse({ kind: "milestones" }).success).toBe(false);
  });

  it("takes only the contract's change types", () => {
    const input = {
      projectId: "project-sample",
      repository: "sample/repository",
      number: 1,
      oldPath: "sample.txt",
      newPath: "sample.txt",
    };
    expect(
      PullRequestDiffFileContentsInput.safeParse({ ...input, changeType: "rename-pure" }).success,
    ).toBe(true);
    expect(
      PullRequestDiffFileContentsInput.safeParse({ ...input, changeType: "moved" }).success,
    ).toBe(false);
  });
});

describe("pull request results", () => {
  const detail = {
    provider: "sample-forge",
    capabilities: {
      diff: true,
      comment: true,
      actions: ["merge", "future-action"],
      mergeMethods: ["squash"],
      search: true,
      review: { inlineComment: true, reply: true, resolve: true, verdicts: ["approve"] },
      reviewers: { request: true, listCandidates: true },
    },
    viewerPermissions: {
      actions: ["merge"],
      comment: true,
      resolve: true,
      verdicts: ["approve"],
      requestReviewers: true,
    },
    projectId: "project-sample",
    projectTitle: "Sample",
    workspaceRoot: "/sample",
    repository: "sample/repository",
    number: 1,
    title: "Sample",
    body: "",
    url: "https://forge.example.invalid/1",
    author: actor,
    state: "open",
    isDraft: false,
    mergeability: "unknown",
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    headBranch: "sample-change",
    baseBranch: "main",
    createdAt,
    updatedAt: createdAt,
    mergedAt: null,
    closedAt: null,
    reviewers: [],
    labels: [],
    checks: [],
    mergeCapabilities: { merge: true, squash: false, rebase: false },
  };

  it("decodes a detail with a newer server's values", () => {
    const decoded = PullRequestDetail.parse({ ...detail, state: "future-state", futureKey: 1 });
    expect(decoded.state).toBe("future-state");
    expect(decoded.capabilities.actions).toEqual(["merge", "future-action"]);
    expect(decoded).toMatchObject({ futureKey: 1 });
  });

  it("refuses a detail that is not in the contract's form", () => {
    expect(PullRequestDetail.safeParse({ ...detail, number: 0 }).success).toBe(false);
    const { capabilities: _, ...partial } = detail;
    expect(PullRequestDetail.safeParse(partial).success).toBe(false);
  });

  it("decodes what the GitLab driver does not send: routing, a stack and thread comments", () => {
    expect(
      PullRequestRoutingResult.parse({
        accountId: "account-sample",
        host: "forge.example.invalid",
        provider: "sample-forge",
        viewer: "sample",
        projectTitle: "Sample",
        workspaceRoot: "/sample",
      }).accountId,
    ).toBe("account-sample");
    const stack = PullRequestStack.parse({
      id: "stack-sample",
      number: 1,
      url: "https://forge.example.invalid/stack/1",
      base: "main",
      layers: [{ number: 1, headBranch: "sample-change", state: "open" }],
    });
    expect(stack.layers).toHaveLength(1);
    const comments = PullRequestThreadCommentsResult.parse({
      comments: [{ id: "comment-1", author: null, body: "Sample", createdAt, url: null }],
      nextCursor: null,
    });
    expect(comments.comments).toHaveLength(1);
  });

  it("counts docs as none when an older server does not send them", () => {
    const count = { additions: 1, deletions: 0 };
    expect(
      PullRequestChangeBreakdown.parse({
        code: count,
        tests: count,
        mocks: count,
        generated: count,
      })?.docs,
    ).toEqual({ additions: 0, deletions: 0 });
    expect(PullRequestChangeBreakdown.parse(null)).toBeNull();
  });

  it("decodes a generated guide and each run, and keeps an unknown run", () => {
    const guide = {
      headSha: "sample-head",
      generatedAt: createdAt,
      modelSelection: { instanceId: "sample-provider", model: "sample-model" },
      stops: [
        {
          title: "Sample stop",
          summary: "",
          attention: { kind: "risk", note: "Sample note" },
          excerpts: [{ path: "sample.txt", side: "new", start: 1, end: 2, caption: "" }],
          files: [{ path: "sample.txt" }],
          notes: [{ path: "sample.txt", line: 1, title: "Sample", body: "" }],
          questions: ["Sample question"],
        },
      ],
    };
    const result = (run: unknown) =>
      PullRequestReviewGuideResult.parse({ guide, run, currentHeadSha: "sample-head" });
    expect(result(null).guide?.stops).toHaveLength(1);
    expect(
      result({ _tag: "Running", headSha: "sample-head", startedAt: createdAt }).run,
    ).toMatchObject({ _tag: "Running" });
    expect(
      result({ _tag: "Failed", headSha: "sample-head", failedAt: createdAt, detail: "Sample" }).run,
    ).toMatchObject({ _tag: "Failed" });
    expect(result({ _tag: "Queued" }).run).toMatchObject({ unknown: true });
  });
});

describe("pull request failures", () => {
  it("decodes both tagged failures", () => {
    const unavailable = decodeRpcErrorRecord({
      _tag: "PullRequestUnavailableError",
      reason: "cli-missing",
      provider: "sample-forge",
      requirement: "Sample requirement",
    });
    expect(isRpcErrorOfTag(unavailable, "PullRequestUnavailableError")).toBe(true);
    const failed = decodeRpcErrorRecord({
      _tag: "PullRequestOperationError",
      operation: "detail",
      detail: "Sample detail",
      reason: "not-found",
    });
    expect(isRpcErrorOfTag(failed, "PullRequestOperationError")).toBe(true);
  });
});
