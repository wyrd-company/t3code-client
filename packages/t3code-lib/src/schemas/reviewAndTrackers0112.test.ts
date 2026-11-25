// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { rpcMethods } from "../rpc/registry.ts";
import { AuthSessionState } from "./auth.ts";
import { AuthMcpAuthorizationServerMetadata } from "./authMcp.ts";
import { IssueEvent } from "./issueRecords.ts";
import { IssueTrackerConnectionList, issueTrackerBindingScopes } from "./issueTrackers.ts";
import { PullRequestCapabilities, PullRequestChecks } from "./pullRequestDetail.ts";
import { PullRequestListEntry } from "./pullRequestList.ts";
import { ReviewDiffPreviewResult } from "./review.ts";
import { ScheduledTaskUpsertInput } from "./scheduledTask.ts";

const at = "2026-01-01T00:00:00.000Z";
const sha = "a".repeat(40);

describe("review, pull request, tracker and auth field changes of 0.1.12", () => {
  it("reuses a branch range's merge base and completes a tracked-only read", () => {
    const input = rpcMethods["review.getDiffPreview"].payload;
    const read = {
      cwd: "/srv/sample",
      mergeBase: sha,
      completionToken: "token-1",
      file: { path: "a.ts", previousPath: null, sourceKind: "branch-range", changeType: "new" },
    };
    expect(input.parse(read)).toEqual(read);
    expect(input.parse({ cwd: "/srv/sample", mergeBase: "HEAD" }).mergeBase).toBe("HEAD");
    for (const mergeBase of ["--output=/tmp/x", "main", "A".repeat(40)]) {
      expect(input.safeParse({ cwd: "/srv/sample", mergeBase }).success, mergeBase).toBe(false);
    }
    const result = ReviewDiffPreviewResult.parse({
      cwd: "/srv/sample",
      generatedAt: at,
      incomplete: true,
      completionToken: "token-1",
      sources: [
        {
          id: "source-1",
          kind: "branch-range",
          title: "Branch",
          baseRef: "main",
          headRef: "topic",
          mergeBase: sha,
          diff: "",
          diffHash: "hash-1",
          truncated: false,
        },
      ],
    });
    expect(result.completionToken).toBe("token-1");
    expect(result.sources[0]?.mergeBase).toBe(sha);
  });

  it("reads each tracked repository's patch of a turn diff, and the refs digest of a refresh", () => {
    const diff = {
      threadId: "thread-1",
      fromTurnCount: 0,
      toTurnCount: 1,
      diff: "",
      repositories: [
        { name: "lib", repositoryPath: "/srv/lib", relativePath: "../lib", diff: "diff --git" },
      ],
    };
    expect(rpcMethods["orchestration.getTurnDiff"].success.parse(diff)).toEqual(diff);
    expect(rpcMethods["orchestration.getFullThreadDiff"].success.parse(diff)).toEqual(diff);
    expect(
      rpcMethods["orchestration.getTurnDiff"].success.safeParse({
        ...diff,
        repositories: [{ name: "lib" }],
      }).success,
    ).toBe(false);
    const status = rpcMethods["vcs.refreshStatus"].success.parse({
      isRepo: true,
      hasPrimaryRemote: false,
      isDefaultRef: true,
      refName: "main",
      hasWorkingTreeChanges: false,
      workingTree: { files: [], insertions: 0, deletions: 0 },
      hasUpstream: false,
      aheadCount: 0,
      behindCount: 0,
      pr: null,
      refsDigest: "digest-1",
    });
    expect(status.refsDigest).toBe("digest-1");
  });

  it("reads pull request visibility, stack auto-merge and pending workflow approvals", () => {
    expect(PullRequestCapabilities.shape.stackAutoMerge.parse(true)).toBe(true);
    expect(PullRequestListEntry.shape.visibility.parse("private")).toBe("private");
    expect(PullRequestListEntry.shape.visibility.parse("internal")).toBe("internal");
    const checks = { state: "open", checks: [], workflowApprovalsRequired: 2 };
    expect(PullRequestChecks.parse(checks).workflowApprovalsRequired).toBe(2);
    expect(PullRequestChecks.safeParse({ ...checks, workflowApprovalsRequired: -1 }).success).toBe(
      false,
    );
    const review = rpcMethods["pullRequests.submitReview"].payload.parse({
      projectId: "project-1",
      repository: "sample/repo",
      number: 1,
      expectedHeadSha: sha,
      verdict: "approve",
      body: "",
      comments: [],
    });
    expect(review).toMatchObject({ expectedHeadSha: sha });
  });

  it("reads and sends issue tracker accounts and extra scopes", () => {
    const binding = {
      tracker: "linear",
      accountId: "work",
      scope: "TEAM",
      additionalScopes: ["OPS"],
    };
    expect(issueTrackerBindingScopes(binding as never)).toEqual(["TEAM", "OPS"]);
    const connection = {
      tracker: "linear",
      displayName: "Linear",
      host: "linear.invalid",
      scopeNoun: "team",
      credential: { label: "API key", helpUrl: null },
      connected: true,
      account: "sample",
      detail: null,
      scopes: [],
    };
    const list = IssueTrackerConnectionList.parse({
      trackers: [connection],
      accounts: [{ ...connection, accountId: "work" }],
      bindings: {},
      accountBindings: { "project-1": binding },
    });
    expect(list.accounts?.[0]?.accountId).toBe("work");
    expect(Object.values(list.accountBindings ?? {})[0]?.additionalScopes).toEqual(["OPS"]);
    const connect = rpcMethods["issueTrackers.connect"].payload;
    expect(
      connect.parse({ tracker: "linear", addAccount: true, accountId: "work", token: "sample" }),
    ).toMatchObject({ addAccount: true, accountId: "work" });
    expect(connect.safeParse({ tracker: "linear", accountId: "Work!", token: null }).success).toBe(
      false,
    );
    const bind = rpcMethods["issueTrackers.bindProject"].payload;
    expect(bind.parse({ projectId: "project-1", binding: null, accountId: "work" })).toMatchObject({
      accountId: "work",
    });
    expect(
      bind.safeParse({
        projectId: "project-1",
        binding: { ...binding, additionalScopes: Array(251).fill("S") },
      }).success,
    ).toBe(false);
  });

  it("reads where a referenced issue event came from, and unbinds a scheduled task's thread", () => {
    const event = IssueEvent.parse({
      id: "event-1",
      kind: "referenced",
      actor: null,
      createdAt: at,
      detail: null,
      reference: {
        repository: "sample/repo",
        number: 2,
        kind: "pull-request",
        url: "https://host.invalid/sample/repo/pull/2",
      },
    });
    expect(event.reference).toMatchObject({ number: 2, kind: "pull-request" });
    const upsert = ScheduledTaskUpsertInput.shape.unbindThread;
    expect(upsert.parse(true)).toBe(true);
    expect(upsert.safeParse("yes").success).toBe(false);
  });

  it("reads the session's own id and the MCP revocation endpoint", () => {
    const state = AuthSessionState.shape.sessionId;
    expect(state.parse("session-1")).toBe("session-1");
    expect(AuthMcpAuthorizationServerMetadata.shape.revocation_endpoint.parse(undefined)).toBe(
      undefined,
    );
    expect(
      AuthMcpAuthorizationServerMetadata.shape.revocation_endpoint.parse(
        "https://host.invalid/oauth/mcp/revoke",
      ),
    ).toBe("https://host.invalid/oauth/mcp/revoke");
  });
});
