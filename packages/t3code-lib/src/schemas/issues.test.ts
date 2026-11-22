// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, it } from "vite-plus/test";
import { rpcMethods } from "../rpc/registry.ts";
import { OrchestrationV2Command } from "./orchestration/commands.ts";
import { ThreadIssueKey, ThreadIssueLink, threadIssueKeysEqual } from "./threadIssues.ts";

const host = "github.example";
const tracker = "github";
const scope = "sample/repository";
const projectId = "project-1";
const scopeRef = { projectId, tracker, scope };
const issue = { ...scopeRef, key: "123" };
const issueKey = { host, tracker, scope, key: issue.key };
const title = "Sample issue";
const displayKey = "#123";
const url = "https://github.example/sample/repository/issues/123";
const now = "2030-01-01T00:00:00.000Z";
const markdown = "    preserve indentation\n";
const label = { name: "sample", color: null, description: null };
const actor = { login: "sample-user", name: null, avatarUrl: null };
const comment = { id: "comment-1", body: markdown, author: actor, createdAt: now, url: null };
const state = { category: "open", name: "Open" };
const summary = {
  ...issueKey,
  projectId,
  projectTitle: "Sample project",
  title,
  displayKey,
  url,
  author: null,
  createdAt: now,
  updatedAt: now,
  closedAt: null,
  state,
  assignees: [actor],
  labels: [label],
  commentCount: 1,
};
const viewerPermissions = {
  setState: true,
  comment: true,
  edit: true,
  labels: true,
  assignees: true,
};
const capabilities = {
  create: true,
  edit: true,
  comment: true,
  labels: true,
  assignees: true,
  reactions: true,
  templates: true,
  linkedPullRequests: true,
  events: true,
  search: true,
};
const cursors = { "github.example sample/repository": "sample-cursor" };
const binding = { tracker: "linear", scope: "sample-team" };
const standaloneTracker = {
  tracker: "linear",
  displayName: "Sample tracker",
  host: "tracker.example",
  scopeNoun: "team",
  credential: { label: "Token", helpUrl: null },
  account: null,
  connected: false,
  detail: null,
  scopes: [],
};
const create = {
  ...scopeRef,
  title,
  body: markdown,
  labels: [label.name],
  assignees: [actor.login],
};

describe("stock issue RPC contracts", () => {
  it.each([
    ["issues.list", { state: "open", limit: 200, cursors }, { state: "open", limit: 201 }],
    ["issues.detail", issue, { ...issue, tracker: "invalid tracker" }],
    ["issues.comments", { ...issue, cursor: "older" }, { ...issue, cursor: "" }],
    ["issues.templates", scopeRef, { ...scopeRef, projectId: "" }],
    ["issues.candidates", scopeRef, { ...scopeRef, scope: "" }],
    ["issues.linkedThreads", issueKey, { ...issueKey, host: "" }],
    ["issues.create", create, { ...create, title: "" }],
    ["issues.comment", { ...issue, body: markdown }, { ...issue, body: "" }],
    ["issues.update", { ...issue, body: "" }, { ...issue, labels: [1] }],
    ["issues.setState", { ...issue, state: "Done" }, { ...issue, state: " " }],
    [
      "issues.react",
      { ...issue, content: "heart", reacted: true },
      { ...issue, content: "other", reacted: true },
    ],
    ["issueTrackers.list", {}, null],
    ["issueTrackers.connect", { tracker: "linear", token: null }, { tracker: "linear", token: "" }],
    [
      "issueTrackers.bindProject",
      { projectId, binding },
      { projectId, binding: { tracker: "linear" } },
    ],
  ] as const)("validates the payload of %s", (method, input, invalid) => {
    expect(rpcMethods[method].payload.parse(input)).toEqual(input);
    expect(rpcMethods[method].payload.safeParse(invalid).success).toBe(false);
  });

  it("decodes a page with cursors and a detail with nested issue records", () => {
    const page = {
      entries: [summary],
      nextCursors: cursors,
      viewers: {},
      trackers: [{ tracker, host, projectCount: 1, capabilities, configured: true, detail: null }],
      errors: [],
      scopes: [scopeRef],
    };
    const list = rpcMethods["issues.list"].success;
    expect(list.parse(page)).toEqual(page);
    expect(list.safeParse({ ...page, entries: [{ ...summary, commentCount: -1 }] }).success).toBe(
      false,
    );

    const detail = {
      ...summary,
      writable: true,
      capabilities,
      viewerPermissions,
      states: [state],
      viewer: actor.login,
      body: markdown,
      comments: [comment],
      commentsCursor: null,
      events: [{ id: "event-1", kind: "future-event", actor, createdAt: now, detail: null }],
      linkedPullRequests: [
        {
          repository: scope,
          number: 1,
          title: "Sample change",
          url,
          state: "open",
          isDraft: false,
          closesIssue: true,
        },
      ],
    };
    const result = rpcMethods["issues.detail"].success;
    expect(result.parse(detail)).toEqual(detail);
    expect(
      result.safeParse({ ...detail, viewerPermissions: { ...viewerPermissions, edit: "yes" } })
        .success,
    ).toBe(false);
  });

  it("decodes comments, templates, candidates, threads and tracker bindings", () => {
    const results = [
      ["issues.comments", { comments: [comment], nextCursor: null }, { comments: [comment] }],
      [
        "issues.templates",
        {
          templates: [],
          externalTemplates: [{ name: "Sample", about: "", url }],
          blankIssuesEnabled: false,
        },
        { templates: [] },
      ],
      [
        "issues.candidates",
        { labels: [label], assignees: [{ ...actor, id: "user-1" }], truncated: false },
        { labels: [label], assignees: [actor], truncated: false },
      ],
      [
        "issues.linkedThreads",
        { threads: [{ id: "thread-1", projectId, title, archivedAt: null, settled: false }] },
        { threads: [{ id: "thread-1" }] },
      ],
      ["issues.create", { key: issue.key, displayKey, url }, { key: issue.key, displayKey }],
      [
        "issueTrackers.list",
        { trackers: [standaloneTracker], bindings: { [projectId]: binding } },
        { trackers: [standaloneTracker], bindings: { [projectId]: {} } },
      ],
      ["issueTrackers.connect", standaloneTracker, { ...standaloneTracker, connected: "no" }],
    ] as const;
    for (const [method, data, invalid] of results) {
      const schema = rpcMethods[method].success;
      expect(schema.parse(data), method).toEqual(data);
      expect(schema.safeParse(invalid).success, method).toBe(false);
    }
    for (const method of [
      "issues.comment",
      "issues.update",
      "issues.setState",
      "issues.react",
      "issueTrackers.bindProject",
    ] as const) {
      expect(rpcMethods[method].success.parse(null), method).toBeUndefined();
      expect(rpcMethods[method].success.safeParse({}).success, method).toBe(false);
    }
  });
});

describe("thread issue links", () => {
  const stamped = { commandId: "command-1", threadId: "thread-1", ...issueKey };
  const fields = { projectId, title, displayKey, url };

  it("validates link and unlink commands and accepts new link sources in responses", () => {
    const link = { type: "thread.issue.link", ...stamped, ...fields, source: "manual" };
    const unlink = { type: "thread.issue.unlink", ...stamped };
    expect(OrchestrationV2Command.parse(link)).toEqual(link);
    expect(OrchestrationV2Command.parse(unlink)).toEqual(unlink);
    expect(OrchestrationV2Command.safeParse({ ...link, source: "future-source" }).success).toBe(
      false,
    );
    const record = { ...issueKey, ...fields, source: "future-source", linkedAt: now };
    expect(ThreadIssueLink.parse(record)).toEqual(record);
    expect(ThreadIssueKey.safeParse({ ...issueKey, host: undefined }).success).toBe(false);
  });

  it("normalizes the host and scope and preserves the issue key's case", () => {
    const value = ThreadIssueKey.parse(issueKey);
    expect(
      threadIssueKeysEqual(value, {
        ...value,
        host: host.toUpperCase(),
        scope: scope.toUpperCase(),
      }),
    ).toBe(true);
    expect(threadIssueKeysEqual({ ...value, key: "SAMPLE-1" }, { ...value, key: "sample-1" })).toBe(
      false,
    );
  });
});
