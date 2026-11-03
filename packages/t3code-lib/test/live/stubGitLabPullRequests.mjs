#!/usr/bin/env node
/**
 * Plays GitLab's API for the `glab` calls of the server's merge request reads and
 * writes. It answers one merge request of `sample/repository` from fixed values and
 * the commits in `STUB_FORGE_ROOT/forge.json`, and it never reaches a network. A
 * write changes nothing. It adds a line to `STUB_FORGE_ROOT/calls.jsonl`. A missing
 * resource exits as `glab` does on a 404.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const [, , command, path, ...rest] = process.argv;
const forgeRoot = process.env["STUB_FORGE_ROOT"] ?? "";
const { headSha, baseSha } = JSON.parse(
  NodeFS.readFileSync(NodePath.join(forgeRoot, "forge.json"), "utf8"),
);
const project = "projects/sample%2Frepository";
const author = { id: 11, username: "sample-author", name: "Sample Author", avatar_url: null };
const reviewer = { id: 12, username: "sample-reviewer", name: null, avatar_url: null };
const createdAt = "2026-01-01T00:00:00.000Z";

const mergeRequest = {
  iid: 7,
  title: "Sample change",
  web_url: "https://gitlab.invalid/sample/repository/-/merge_requests/7",
  description: "Sample description",
  author,
  source_branch: "sample-change",
  target_branch: "main",
  sha: headSha,
  state: "opened",
  draft: false,
  merge_status: "can_be_merged",
  has_conflicts: false,
  created_at: createdAt,
  updated_at: createdAt,
  merged_at: null,
  closed_at: null,
  reviewers: [reviewer],
  labels: ["sample-label"],
  changes_count: "1",
  head_pipeline: {
    id: 21,
    project_id: 31,
    status: "success",
    web_url: "https://gitlab.invalid/sample/repository/-/pipelines/21",
    source: "push",
  },
  user: { can_merge: true },
  diff_refs: { base_sha: baseSha, head_sha: headSha, start_sha: baseSha },
  diverged_commits_count: 0,
};

const position = {
  position_type: "text",
  new_path: "sample.txt",
  old_path: "sample.txt",
  new_line: 1,
  old_line: null,
};

function graphql() {
  const { query } = JSON.parse(NodeFS.readFileSync(0, "utf8"));
  if (query.includes("blobs(")) {
    return {
      data: {
        project: {
          repository: { blobs: { nodes: [{ path: "sample.txt", oid: "sample-blob" }] } },
        },
      },
    };
  }
  if (query.includes("awardEmoji")) {
    return {
      data: {
        currentUser: { username: "sample-viewer" },
        project: {
          mergeRequest: {
            awardEmoji: { nodes: [{ name: "thumbsup", user: { username: "sample-reviewer" } }] },
            notes: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
          },
        },
      },
    };
  }
  if (query.includes("diffStats {") || query.includes("diffStats{")) {
    return {
      data: {
        project: {
          mergeRequest: {
            diffStatsSummary: { fileCount: 1 },
            diffStats: [{ path: "sample.txt", additions: 1, deletions: 1 }],
          },
        },
      },
    };
  }
  if (query.includes("mergeRequests")) {
    return {
      data: {
        project: {
          mergeRequests: {
            nodes: [{ iid: "7", diffStatsSummary: { additions: 1, deletions: 1 } }],
          },
        },
      },
    };
  }
  throw new Error(`unexpected GraphQL query: ${query}`);
}

/** Number 9 plays a host that refuses the credential. */
if (path.includes("/merge_requests/9")) {
  process.stderr.write("401 Unauthorized\n");
  process.exit(1);
}

function recordCall(call) {
  NodeFS.appendFileSync(NodePath.join(forgeRoot, "calls.jsonl"), `${JSON.stringify(call)}\n`);
}

if (command === "mr") {
  recordCall({ args: process.argv.slice(2) });
  process.exit(0);
}

const methodFlag = rest.indexOf("--method");
if (methodFlag !== -1 && path !== "graphql") {
  recordCall({
    method: rest[methodFlag + 1],
    path,
    ...(rest.includes("--input") ? { body: JSON.parse(NodeFS.readFileSync(0, "utf8")) } : {}),
  });
  process.stdout.write("{}");
  process.exit(0);
}

/** `[pattern, answer]`, in order. A string answer is written as it is. */
const routes = [
  [/^user$/u, () => ({ id: 41, username: "sample-viewer" })],
  [/^graphql$/u, graphql],
  [new RegExp(`^${project}/merge_requests\\?`, "u"), () => [mergeRequest]],
  [
    new RegExp(`^${project}/merge_requests/7/diffs\\?`, "u"),
    () => [
      {
        old_path: "sample.txt",
        new_path: "sample.txt",
        diff: "@@ -1 +1 @@\n-first\n+second\n",
      },
    ],
  ],
  [
    new RegExp(`^${project}/merge_requests/7/notes\\?`, "u"),
    () => [
      { id: 51, body: "Sample comment", author: reviewer, created_at: createdAt, system: false },
    ],
  ],
  [
    new RegExp(`^${project}/merge_requests/7/discussions\\?`, "u"),
    () => [
      {
        id: "sample-discussion",
        notes: [
          {
            id: 52,
            body: "Sample inline comment",
            author: reviewer,
            created_at: createdAt,
            system: false,
            resolvable: true,
            resolved: false,
            position,
          },
        ],
      },
    ],
  ],
  [
    new RegExp(`^${project}/merge_requests/7/commits\\?`, "u"),
    () => [
      {
        id: headSha,
        title: "Sample change",
        committed_date: createdAt,
        author_name: "Sample Author",
        stats: { additions: 1, deletions: 1 },
      },
    ],
  ],
  [
    new RegExp(`^${project}/merge_requests/7/award_emoji(\\?|$)`, "u"),
    () => [{ id: 61, name: "thumbsup", user: { username: "sample-viewer" } }],
  ],
  [new RegExp(`^${project}/merge_requests/7(\\?|$)`, "u"), () => mergeRequest],
  [
    new RegExp(`^${project}/repository/files/sample\\.txt/raw\\?ref=${baseSha}$`, "u"),
    () => "first\n",
  ],
  [
    new RegExp(`^${project}/repository/files/sample\\.txt/raw\\?ref=${headSha}$`, "u"),
    () => "second\n",
  ],
  [
    new RegExp(`^${project}/labels\\?`, "u"),
    () => [{ name: "sample-label", color: "#112233", description: "Sample description" }],
  ],
  [new RegExp(`^${project}/users\\?`, "u"), () => [author, reviewer]],
  [
    new RegExp(`^${project}(\\?|$)`, "u"),
    () => ({
      default_branch: "main",
      merge_method: "merge",
      squash_option: "default_off",
    }),
  ],
];

if (command !== "api") {
  process.stderr.write(`unexpected glab call: ${process.argv.slice(2).join(" ")}\n`);
  process.exit(64);
}
const route = routes.find(([pattern]) => pattern.test(path));
if (route === undefined) {
  process.stderr.write("404 Not Found\n");
  process.exit(1);
}
const answer = route[1]();
process.stdout.write(typeof answer === "string" ? answer : JSON.stringify(answer));
