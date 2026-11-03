// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The pull request writes on an owned stock server with its own `HOME`. A local
 * `glab` stub records what the server sends to the forge, so that a test can read
 * the write and no call reaches a forge. The GitLab driver has no label writes,
 * stacks or `request-changes` verdict, so those reach the server's refusal.
 */
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { T3Client } from "../../src/index.ts";
import { projectId } from "../../src/schemas/common.ts";
import { hasLiveServer, refusal } from "./liveClient.ts";
import { withScopes } from "./peerServer.ts";
import { repository, startPullRequestServer, type PullRequestServer } from "./pullRequestForge.ts";

const mergeRequest = "projects/sample%2Frepository/merge_requests/7";

describe.skipIf(!hasLiveServer)("pull request writes with a local forge stub", () => {
  let peer: PullRequestServer;
  let client: T3Client;
  const project = projectId(`project-${crypto.randomUUID()}`);
  const ref = { projectId: project, repository, number: 7 };

  beforeAll(async () => {
    peer = await startPullRequestServer(project);
    client = peer.client;
  });

  afterAll(() => peer?.stop());

  it("posts and rewrites a comment, and rewrites the merge request", async () => {
    await client.rpc.call("pullRequests.comment", { ...ref, body: "Sample comment\n" });
    await client.rpc.call("pullRequests.updateComment", {
      ...ref,
      commentId: "51",
      kind: "issue-comment",
      body: "Sample rewrite",
    });
    await client.rpc.call("pullRequests.update", { ...ref, title: "Sample title", body: "" });
    await expect(peer.takeForgeCalls()).resolves.toEqual([
      { method: "POST", path: `${mergeRequest}/notes`, body: { body: "Sample comment\n" } },
      { method: "PUT", path: `${mergeRequest}/notes/51`, body: { body: "Sample rewrite" } },
      { method: "PUT", path: mergeRequest, body: { title: "Sample title", description: "" } },
    ]);
  });

  it("refuses what the driver cannot write", async () => {
    await expect(
      refusal(client.rpc.call("pullRequests.comment", { ...ref, body: "  " })),
    ).resolves.toMatchObject({ _tag: "PullRequestOperationError", operation: "comment" });
    await expect(
      refusal(client.rpc.call("pullRequests.update", { ...ref, maintainerCanModify: true })),
    ).resolves.toMatchObject({ _tag: "PullRequestOperationError", operation: "update" });
    await expect(refusal(client.rpc.call("pullRequests.update", ref))).resolves.toMatchObject({
      _tag: "PullRequestOperationError",
      detail: "Nothing was changed.",
    });
    await expect(
      refusal(
        client.rpc.call("pullRequests.submitReview", {
          ...ref,
          verdict: "request-changes",
          body: "Sample review",
          comments: [],
        }),
      ),
    ).resolves.toMatchObject({ _tag: "PullRequestOperationError", operation: "submitReview" });
    await expect(
      refusal(
        client.rpc.call("pullRequests.setLabels", {
          ...ref,
          labels: ["sample-label"],
          applied: true,
        }),
      ),
    ).resolves.toMatchObject({ _tag: "PullRequestOperationError", operation: "setLabels" });
    await expect(
      refusal(client.rpc.call("pullRequests.runAction", { ...ref, action: "delete-branch" })),
    ).resolves.toMatchObject({ _tag: "PullRequestOperationError", operation: "runAction" });
    await expect(
      refusal(
        client.rpc.call("pullRequests.runAction", { ...ref, action: "merge", stackNumber: 7 }),
      ),
    ).resolves.toMatchObject({ _tag: "PullRequestOperationError" });
    await expect(peer.takeForgeCalls()).resolves.toEqual([]);
  });

  it("submits a review as line comments, a summary and then the verdict", async () => {
    await client.rpc.call("pullRequests.submitReview", {
      ...ref,
      verdict: "approve",
      body: "Sample review",
      comments: [
        {
          path: "sample.txt",
          position: { kind: "added", newLine: 1 },
          body: "Sample line comment",
        },
        {
          path: "sample.txt",
          oldPath: "former.txt",
          position: { kind: "context", oldLine: 2, newLine: 3, side: "right" },
          body: "Sample context comment",
        },
      ],
    });
    const calls = await peer.takeForgeCalls();
    expect(calls).toMatchObject([
      {
        method: "POST",
        path: `${mergeRequest}/discussions`,
        body: {
          body: "Sample line comment",
          position: { head_sha: peer.headSha, new_path: "sample.txt", new_line: 1 },
        },
      },
      {
        method: "POST",
        path: `${mergeRequest}/discussions`,
        body: { position: { old_path: "former.txt", old_line: 2, new_line: 3 } },
      },
      { method: "POST", path: `${mergeRequest}/notes`, body: { body: "Sample review" } },
      { method: "POST", path: `${mergeRequest}/approve` },
    ]);
  });

  it("replies to a review thread and resolves it", async () => {
    const thread = { ...ref, threadId: "sample-discussion" };
    await client.rpc.call("pullRequests.replyToThread", { ...thread, body: "Sample reply" });
    await client.rpc.call("pullRequests.setThreadResolution", { ...thread, resolved: true });
    const path = `${mergeRequest}/discussions/sample-discussion`;
    await expect(peer.takeForgeCalls()).resolves.toEqual([
      { method: "POST", path: `${path}/notes`, body: { body: "Sample reply" } },
      { method: "PUT", path, body: { resolved: true } },
    ]);
  });

  it("adds and removes a reaction", async () => {
    await client.rpc.call("pullRequests.setReaction", {
      ...ref,
      content: "thumbs-up",
      reacted: true,
    });
    await client.rpc.call("pullRequests.setReaction", {
      ...ref,
      subjectId: "51",
      content: "heart",
      reacted: true,
    });
    await client.rpc.call("pullRequests.setReaction", {
      ...ref,
      content: "thumbs-up",
      reacted: false,
    });
    await expect(peer.takeForgeCalls()).resolves.toEqual([
      { method: "POST", path: `${mergeRequest}/award_emoji?name=thumbsup` },
      { method: "POST", path: `${mergeRequest}/notes/51/award_emoji?name=heart` },
      { method: "DELETE", path: `${mergeRequest}/award_emoji/61` },
    ]);
  });

  it("requests a reviewer and removes one", async () => {
    await client.rpc.call("pullRequests.requestReviewers", {
      ...ref,
      reviewers: [{ id: "11", kind: "user" }],
      requested: true,
    });
    await client.rpc.call("pullRequests.requestReviewers", {
      ...ref,
      reviewers: [{ id: "12", kind: "user" }],
      requested: false,
    });
    await expect(peer.takeForgeCalls()).resolves.toEqual([
      { method: "PUT", path: mergeRequest, body: { reviewer_ids: [12, 11] } },
      { method: "PUT", path: mergeRequest, body: { reviewer_ids: [] } },
    ]);
  });

  it("runs the actions of the driver", async () => {
    await client.rpc.call("pullRequests.runAction", {
      ...ref,
      action: "merge",
      mergeMethod: "squash",
    });
    await client.rpc.call("pullRequests.runAction", { ...ref, action: "close" });
    await client.rpc.call("pullRequests.runAction", { ...ref, action: "disable-auto-merge" });
    const target = ["7", "--repo", repository];
    await expect(peer.takeForgeCalls()).resolves.toEqual([
      {
        args: [
          "mr",
          "merge",
          ...target,
          "--auto-merge=false",
          "--yes",
          "--squash",
          "--sha",
          peer.headSha,
        ],
      },
      { args: ["mr", "close", ...target] },
      { method: "POST", path: `${mergeRequest}/cancel_merge_when_pipeline_succeeds` },
    ]);
  });

  it("refuses when the host refuses the credential", async () => {
    await expect(
      refusal(client.rpc.call("pullRequests.comment", { ...ref, number: 9, body: "Sample" })),
    ).resolves.toMatchObject({
      _tag: "PullRequestUnavailableError",
      reason: "cli-unauthenticated",
    });
  });

  it("needs the write scope on the client and on the server", async () => {
    const comment = { ...ref, body: "Sample comment" };
    await withScopes(peer, ["orchestration:read"], async (narrow) => {
      await expect(narrow.rpc.call("pullRequests.comment", comment)).rejects.toThrow(
        /source-control:write/u,
      );
      // `requiredPermission` names the missing scope. `requiredScope` is its legacy parent.
      await expect(narrow.rpc.callRaw("pullRequests.comment", comment)).rejects.toMatchObject({
        record: {
          _tag: "EnvironmentAuthorizationError",
          requiredPermission: "source-control:write",
        },
      });
      await expect(
        narrow.rpc.callRaw("pullRequests.generateReviewGuide", ref),
      ).rejects.toMatchObject({
        record: {
          _tag: "EnvironmentAuthorizationError",
          requiredPermission: "orchestration:operate",
        },
      });
      await expect(
        narrow.rpc.call("pullRequests.reportState", { reference: ref, state: "open" }),
      ).resolves.toBeUndefined();
    });
    await expect(peer.takeForgeCalls()).resolves.toEqual([]);
  });
});
