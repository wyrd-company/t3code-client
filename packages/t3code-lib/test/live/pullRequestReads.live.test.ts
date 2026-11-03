// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The pull request reads on an owned stock server with its own `HOME`. A local
 * `glab` stub answers for one merge request, so that no call reaches a forge.
 * The GitLab driver has no routing identity, stacks or paged thread comments, so
 * those reads reach the server's refusal or its empty answer.
 */
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { projectId, providerInstanceId } from "../../src/schemas/common.ts";
import type { T3Client } from "../../src/index.ts";
import { firstItem, hasLiveServer, refusal, waitFor } from "./liveClient.ts";
import { withScopes } from "./peerServer.ts";
import {
  host,
  repository,
  startPullRequestServer,
  type PullRequestServer,
} from "./pullRequestForge.ts";

describe.skipIf(!hasLiveServer)("pull request reads with a local forge stub", () => {
  let peer: PullRequestServer;
  let client: T3Client;
  const project = projectId(`project-${crypto.randomUUID()}`);
  const ref = { projectId: project, repository, number: 7 };

  beforeAll(async () => {
    peer = await startPullRequestServer(project);
    client = peer.client;
  });

  afterAll(() => peer?.stop());

  it("lists the merge request, with its stats and filter options", async () => {
    const listed = await client.rpc.call("pullRequests.list", { state: "open", limit: 10 });
    expect(listed.errors).toEqual([]);
    expect(listed.viewers).toEqual({ [host]: "sample-viewer" });
    expect(listed.providers).toMatchObject([{ host, kind: "gitlab", configured: true }]);
    expect(listed.entries).toMatchObject([
      {
        provider: "gitlab",
        projectId: project,
        repository,
        number: 7,
        state: "open",
        labels: [{ name: "sample-label" }],
      },
    ]);
    const { stats } = await client.rpc.call("pullRequests.listStats", { refs: [ref] });
    expect(stats).toEqual([
      { projectId: project, repository, number: 7, additions: 1, deletions: 1 },
    ]);
    const labels = await client.rpc.call("pullRequests.filterOptions", {
      kind: "labels",
      projectId: project,
    });
    expect(labels.labels.map((label) => label.name)).toEqual(["sample-label"]);
    const authors = await client.rpc.call("pullRequests.filterOptions", {
      kind: "authors",
      projectId: project,
      query: "sample",
    });
    expect(authors.authors.map((author) => author.login)).toContain("sample-author");
  });

  it("reads the summary, detail, preview and checks", async () => {
    await expect(client.rpc.call("pullRequests.summary", ref)).resolves.toMatchObject({
      provider: "gitlab",
      number: 7,
      state: "open",
    });
    const detail = await client.rpc.call("pullRequests.detail", ref);
    expect(detail).toMatchObject({
      provider: "gitlab",
      projectTitle: "Sample project",
      headSha: peer.headSha,
      mergeability: "mergeable",
      capabilities: { diff: true, viewedFiles: "environment" },
      viewerPermissions: { comment: true },
    });
    expect(detail.capabilities.review.verdicts).toContain("approve");
    await expect(client.rpc.call("pullRequests.preview", ref)).resolves.toMatchObject({
      title: "Sample change",
      isDraft: false,
    });
    const checks = await client.rpc.call("pullRequests.checks", ref);
    expect(checks?.checks.map((check) => check.status)).toContain("success");
  });

  it("reads the activity of comments, review threads and commits", async () => {
    const activity = await client.rpc.call("pullRequests.activity", ref);
    expect(activity.comments.map((comment) => comment.body)).toContain("Sample comment");
    expect(activity.reviewThreads).toMatchObject([
      { id: "sample-discussion", path: "sample.txt", line: 1, isResolved: false },
    ]);
    expect(activity.commits.map((commit) => commit.oid)).toEqual([peer.headSha]);
    expect(activity.reactions).toMatchObject([{ content: "thumbs-up", count: 1 }]);
  });

  it("reads the diff over HTTP, and the contents of a changed file", async () => {
    const diff = await client.routes.call("pullRequests.diff", { body: ref });
    expect(diff.patch).toContain("+second");
    expect(diff).toMatchObject({ truncated: false, nextCursor: null });
    await expect(
      client.rpc.call("pullRequests.diffFileContents", {
        ...ref,
        changeType: "change",
        oldPath: "sample.txt",
        newPath: "sample.txt",
      }),
    ).resolves.toEqual({ oldContents: "first\n", newContents: "second\n" });
  });

  it("reads viewed files and the change breakdown", async () => {
    await expect(client.rpc.call("pullRequests.filesViewed", ref)).resolves.toEqual({
      files: [],
      truncated: false,
    });
    const breakdown = await client.rpc.call("pullRequests.changeBreakdown", ref);
    // The stub's only file counts as code or docs, depending on how the server sorts its path.
    expect(breakdown).toMatchObject({
      tests: { additions: 0, deletions: 0 },
      mocks: { additions: 0, deletions: 0 },
      generated: { additions: 0, deletions: 0 },
    });
    expect((breakdown?.code.additions ?? 0) + (breakdown?.docs.additions ?? 0)).toBe(1);
  });

  it("reads the review guide state without a generated guide", async () => {
    await expect(client.rpc.call("pullRequests.reviewGuide", ref)).resolves.toEqual({
      guide: null,
      run: null,
      currentHeadSha: peer.headSha,
    });
  });

  it("reads the reviewer candidates", async () => {
    const reviewers = await client.rpc.call("pullRequests.reviewerCandidates", ref);
    expect(reviewers.candidates).toContainEqual(
      expect.objectContaining({ login: "sample-reviewer", kind: "user", isRequested: true }),
    );
  });

  it("reads the threads linked to the merge request", async () => {
    await expect(client.rpc.call("pullRequests.linkedThreads", ref)).resolves.toEqual({
      threads: [],
    });
    const { id } = await client.threads.create({
      projectId: project,
      title: "Sample thread",
      modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
    });
    await client.threads.dispatch({
      type: "thread.pull-request.link",
      commandId: client.threads.dispatcher.newCommandId(),
      threadId: id,
      host,
      repository,
      number: 7,
      url: "https://gitlab.invalid/sample/repository/-/merge_requests/7",
      source: "manual",
    });
    const linked = await waitFor(async () => {
      const answer = await client.rpc.call("pullRequests.linkedThreads", ref);
      return answer.threads.length > 0 ? answer : undefined;
    }, "the linked thread");
    expect(linked.threads).toMatchObject([{ id, projectId: project, archivedAt: null }]);
  });

  it("reaches the refusal or empty answer of what the driver does not have", async () => {
    await expect(client.rpc.call("pullRequests.stack", ref)).resolves.toBeNull();
    await expect(
      refusal(client.rpc.call("pullRequests.labelCandidates", ref)),
    ).resolves.toMatchObject({ _tag: "PullRequestOperationError" });
    await expect(refusal(client.rpc.call("pullRequests.routing", ref))).resolves.toMatchObject({
      _tag: "PullRequestUnavailableError",
      reason: "provider-unsupported",
    });
    await expect(
      refusal(client.rpc.call("pullRequests.routingIdentity", { host })),
    ).resolves.toMatchObject({
      _tag: "PullRequestUnavailableError",
      reason: "provider-unsupported",
    });
    await expect(
      refusal(
        client.rpc.call("pullRequests.threadComments", {
          ...ref,
          threadId: "sample-discussion",
          cursor: "sample-cursor",
        }),
      ),
    ).resolves.toMatchObject({ _tag: "PullRequestOperationError", operation: "threadComments" });
  });

  it("refuses a reference outside the project, and a missing merge request", async () => {
    const elsewhere = { ...ref, repository: "sample/elsewhere" };
    await expect(refusal(client.rpc.call("pullRequests.detail", elsewhere))).resolves.toMatchObject(
      { _tag: "PullRequestOperationError", operation: "resolveRepository" },
    );
    await expect(
      refusal(client.rpc.call("pullRequests.detail", { ...ref, number: 8 })),
    ).resolves.toMatchObject({ _tag: "PullRequestOperationError" });
    await expect(
      client.routes.call("pullRequests.diff", { body: elsewhere }),
    ).rejects.toMatchObject({ status: 502, tag: "PullRequestOperationError" });
  });

  it("refuses when the host refuses the credential, or another account is expected", async () => {
    const refused = { ...ref, number: 9 };
    await expect(refusal(client.rpc.call("pullRequests.detail", refused))).resolves.toMatchObject({
      _tag: "PullRequestUnavailableError",
      reason: "cli-unauthenticated",
      provider: "gitlab",
    });
    await expect(client.routes.call("pullRequests.diff", { body: refused })).rejects.toMatchObject({
      status: 503,
      tag: "PullRequestUnavailableError",
    });
    await expect(
      refusal(
        client.rpc.call("pullRequests.detail", { ...ref, host, expectedAccountId: "sample-other" }),
      ),
    ).resolves.toMatchObject({ _tag: "PullRequestOperationError", operation: "routeIdentity" });
  });

  it("reports a refresh that a cache invalidation starts", async () => {
    const revision = firstItem(client.rpc.stream("pullRequests.subscribeRefreshes", {}), (value) =>
      value > 0 ? value : undefined,
    );
    await client.rpc.call("pullRequests.invalidate", {});
    await expect(revision).resolves.toBeGreaterThan(0);
  });

  it("needs the read scope", async () => {
    await withScopes(peer, ["access:read"], async (narrow) => {
      await expect(narrow.rpc.call("pullRequests.detail", ref)).rejects.toThrow();
    });
  });
});
