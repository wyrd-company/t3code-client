// ---
// relationships:
//   verifies: library
// ---
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vite-plus/test";
import { T3DecodeError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods, type RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import {
  PullRequestActionInput,
  PullRequestCapabilities,
  PullRequestFilterOptions,
  PullRequestFilterOptionsInput,
  PullRequestLinkedThreadsResult,
  PullRequestPreview,
  PullRequestReviewerCandidatesInput,
  PullRequestSummary,
  PullRequestThreadCommentsResult,
} from "./pullRequests.ts";

const at = "2026-01-01T00:00:00.000Z";
const ref = { projectId: "project-sample", repository: "sample/repository", number: 7 };
const actor = { login: "sample", name: null, avatarUrl: null };
const summary = {
  provider: "gitlab",
  projectId: "project-sample",
  repository: "sample/repository",
  number: 7,
  title: "Sample",
  url: "https://forge.example/sample/repository/-/merge_requests/7",
  state: "open",
  headBranch: "sample-head",
  baseBranch: "main",
  updatedAt: at,
};
const capabilities = {
  diff: true,
  comment: true,
  actions: ["merge"],
  mergeMethods: ["squash"],
  search: true,
  review: { inlineComment: true, reply: true, resolve: true, verdicts: ["approve"] },
  reviewers: { request: true, listCandidates: true },
};

describe("pull request reference and mention capabilities", () => {
  it("reads searchCandidates, mentions and referenceSigils, and keeps them optional", () => {
    expect(PullRequestCapabilities.parse(capabilities)).toEqual(capabilities);
    const parsed = PullRequestCapabilities.parse({
      ...capabilities,
      reviewers: { ...capabilities.reviewers, searchCandidates: true },
      mentions: true,
      referenceSigils: ["#", "!", "future-sigil"],
    });
    expect(parsed.reviewers.searchCandidates).toBe(true);
    expect(parsed.mentions).toBe(true);
    expect(parsed.referenceSigils).toEqual(["#", "!", "future-sigil"]);
    expect(PullRequestCapabilities.safeParse({ ...capabilities, mentions: "yes" }).success).toBe(
      false,
    );
  });

  it("takes kind references with a sigil, and only the contract's sigils", () => {
    expect(
      PullRequestFilterOptionsInput.safeParse({ kind: "references", sigil: "!" }).success,
    ).toBe(true);
    expect(
      PullRequestFilterOptionsInput.safeParse({ kind: "references", sigil: "$" }).success,
    ).toBe(false);
  });

  it("reads reference candidates, and none from a server that sends no key", () => {
    const base = { labels: [], authors: [actor], truncated: false };
    expect(PullRequestFilterOptions.parse(base).references).toEqual([]);
    const candidate = {
      reference: "!7",
      kind: "change-request",
      number: 7,
      title: "Sample",
      state: "merged",
    };
    expect(PullRequestFilterOptions.parse({ ...base, references: [candidate] }).references).toEqual(
      [candidate],
    );
    expect(
      PullRequestFilterOptions.safeParse({ ...base, references: [{ ...candidate, number: 0 }] })
        .success,
    ).toBe(false);
  });

  it("bounds the reviewer candidate query", () => {
    expect(PullRequestReviewerCandidatesInput.safeParse(ref).success).toBe(true);
    expect(PullRequestReviewerCandidatesInput.safeParse({ ...ref, query: "sam" }).success).toBe(
      true,
    );
    expect(
      PullRequestReviewerCandidatesInput.safeParse({ ...ref, query: "x".repeat(101) }).success,
    ).toBe(false);
    expect(PullRequestReviewerCandidatesInput.safeParse({ ...ref, query: "  " }).success).toBe(
      false,
    );
  });
});

describe("pull request fields of 0.1.8", () => {
  it("reads summary head and auto-merge state, preview times, settled and hiddenCount", () => {
    const fields = { headSha: "abc123", autoMergeEnabled: true, autoMergeMethod: "squash" };
    expect(PullRequestSummary.parse({ ...summary, ...fields })).toMatchObject(fields);
    const preview = { ...ref, title: "Sample", url: summary.url, author: actor, state: "open" };
    expect(
      PullRequestPreview.parse({
        ...preview,
        isDraft: false,
        createdAt: at,
        updatedAt: at,
        observedAt: 1,
      }),
    ).toMatchObject({ updatedAt: at, observedAt: 1 });
    const thread = {
      id: "thread-1",
      projectId: "project-sample",
      title: "Sample",
      archivedAt: null,
    };
    expect(
      PullRequestLinkedThreadsResult.parse({ threads: [{ ...thread, settled: true }] }).threads[0],
    ).toMatchObject({ settled: true });
    expect(
      PullRequestThreadCommentsResult.parse({ comments: [], nextCursor: null, hiddenCount: 2 }),
    ).toMatchObject({ hiddenCount: 2 });
  });

  it("sends replyWithSummary only as true", () => {
    const input = { ...ref, action: "merge" };
    expect(PullRequestActionInput.safeParse({ ...input, replyWithSummary: true }).success).toBe(
      true,
    );
    expect(PullRequestActionInput.safeParse({ ...input, replyWithSummary: false }).success).toBe(
      false,
    );
  });
});

describe("pullRequests.runAction success", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let client: RpcClient<RpcMethods>;
  const input = rpcMethods["pullRequests.runAction"].payload.parse({ ...ref, action: "close" });

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    client = new RpcClient(connection, rpcMethods);
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("is the summary when the server sends one, else undefined", async () => {
    expectTypeOf<RpcSuccess<RpcMethods, "pullRequests.runAction">>().toEqualTypeOf<
      PullRequestSummary | undefined
    >();
    server.respond("pullRequests.runAction", summary);
    await expect(client.call("pullRequests.runAction", input)).resolves.toMatchObject(summary);
    for (const raw of [null, undefined]) {
      server.respond("pullRequests.runAction", raw);
      await expect(client.call("pullRequests.runAction", input)).resolves.toBeUndefined();
    }
  });

  it("rejects a success that is not a summary", async () => {
    for (const raw of [{}, false, "sample"]) {
      server.respond("pullRequests.runAction", raw);
      await expect(client.call("pullRequests.runAction", input)).rejects.toBeInstanceOf(
        T3DecodeError,
      );
    }
  });
});
