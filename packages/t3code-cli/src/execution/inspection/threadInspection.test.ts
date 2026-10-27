// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  pendingRequests,
  T3Client,
  T3ConnectionError,
  T3NotFoundError,
  threadId,
  type ThreadStatus,
} from "@wyrd-company/t3code-lib";
import { main } from "../../main.ts";
import type { CommandSurface } from "../../registration.ts";
import { executionHandlers } from "../index.ts";
import {
  at,
  items,
  makeProjection,
  makeRun,
  makeRuntimeRequest,
  makeSnapshot,
} from "../../../../t3code-lib/test/support/threadFixtures.ts";

const surface = JSON.parse(
  await NodeFSP.readFile(
    new URL("../../../../../docs/specifications/cli-surface.json", import.meta.url),
    "utf8",
  ),
) as CommandSurface;
const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
const id = threadId("thread-1");
afterEach(() => vi.restoreAllMocks());
async function run(args: string[], json = true) {
  vi.spyOn(T3Client, "create").mockReturnValue(client);
  vi.spyOn(client, "close").mockResolvedValue();
  const stdout: string[] = [],
    stderr: string[] = [];
  const code = await main(
    ["thread", ...args, "--server", "http://127.0.0.1:1", ...(json ? ["--json"] : [])],
    surface,
    {
      stdout: (text) => {
        stdout.push(text);
      },
      stderr: (text) => {
        stderr.push(text);
      },
    },
    executionHandlers,
  );
  return {
    code,
    stdout: stdout.join(""),
    stderr: stderr.join(""),
    result: json ? JSON.parse(stdout.join("")) : null,
  };
}

const projection = makeProjection({
  runs: [
    makeRun({ id: "run-1", ordinal: 1, status: "running" }),
    makeRun({ id: "run-2", ordinal: 2, status: "queued", queueHeld: true, startedAt: null }),
  ],
  runtimeRequests: [
    makeRuntimeRequest("request-1"),
    makeRuntimeRequest("request-2", { kind: "user_input" }),
  ],
  turnItems: [items.approvalRequest("request-1"), items.userInputRequest("request-2")],
});
const status: ThreadStatus = {
  thread: projection.thread,
  snapshotSequence: 4,
  activeRun: projection.runs[0]!,
  latestRun: projection.runs[0]!,
  queuedRuns: [projection.runs[1]!],
  queueHeld: true,
  pendingRequests: { approvals: 1, questions: 1 },
  backgroundWork: null,
};

it("prints thread status as the JSON envelope and concise text", async () => {
  const read = vi.spyOn(client.threads, "status").mockResolvedValue(status);
  expect((await run(["status", "thread-1"])).result).toEqual(
    JSON.parse(JSON.stringify({ data: status, exitCode: 0 })),
  );
  expect(read).toHaveBeenCalledWith(id);
  const text = await run(["status", "thread-1"], false);
  expect(text.code).toBe(0);
  expect(text.stdout).toContain("active\trun-1\trunning\t#1\n");
  expect(text.stdout).toContain("queued\t1\theld\n");
  expect(text.stdout).toContain("requests\tapprovals 1\tquestions 1\n");
  expect(text.stdout).toContain("background\tunavailable\n");
});

it("lists pending approvals and questions, reading the full detail for missing rows", async () => {
  const bounded = vi.spyOn(client.threads, "pendingRequests");
  const detail = vi.spyOn(client.threads, "detail").mockResolvedValue(makeSnapshot(projection, 1));
  bounded.mockResolvedValue(pendingRequests(projection));
  const text = await run(["requests", "thread-1"], false);
  expect(text.stdout).toBe(
    "request-1\tapproval\tcommand\trun sample\nrequest-2\tuser-input\tuser_input\n  q1: Proceed? [yes]\n",
  );
  expect(detail).not.toHaveBeenCalled();
  bounded.mockResolvedValue(pendingRequests({ ...projection, turnItems: [] }));
  const json = await run(["requests", "thread-1"]);
  expect(detail).toHaveBeenCalledWith(id);
  expect(json.result.data.map((request: { item?: unknown }) => request.item !== undefined)).toEqual(
    [true, true],
  );
  bounded.mockResolvedValue([]);
  expect((await run(["requests", "thread-1"])).result).toEqual({ data: [], exitCode: 0 });
});

it("prints usage without inventing missing values", async () => {
  vi.spyOn(client.threads, "usage").mockResolvedValue({
    threadId: id,
    providerThreads: [
      {
        providerThreadId: "provider-thread-1" as never,
        providerInstanceId: "sample-provider" as never,
        appThreadId: id,
        ownerNodeId: null,
        status: "idle",
        contextUsage: { usedTokens: 10, cost: { amount: 0.5, currency: "USD" } },
      },
      {
        providerThreadId: "provider-thread-0" as never,
        providerInstanceId: "sample-provider" as never,
        appThreadId: id,
        ownerNodeId: null,
        status: "closed",
        contextUsage: null,
      },
    ],
    providerTurns: [
      {
        providerTurnId: "provider-turn-1" as never,
        providerThreadId: "provider-thread-1" as never,
        nodeId: "node-1" as never,
        runAttemptId: null,
        runId: null,
        ordinal: 1,
        status: "completed",
        startedAt: at,
        completedAt: at,
      },
    ],
  });
  const text = await run(["usage", "thread-1"], false);
  expect(text.stdout).toBe(
    [
      "providerThread\tprovider-thread-1\tsample-provider\tidle\t10/? tokens\t0.5 USD",
      "providerThread\tprovider-thread-0\tsample-provider\tclosed\tunreported",
      "providerTurn\tprovider-turn-1\t-\tcompleted\tunreported",
      "",
    ].join("\n"),
  );
  const json = await run(["usage", "thread-1"]);
  expect(json.result.data.providerTurns[0]).not.toHaveProperty("tokenUsage");
  expect(json.result.data.providerThreads[1].contextUsage).toBeNull();
});

it("diffs the full thread by default and an exact paired range", async () => {
  const diff = vi.spyOn(client.threads, "diff");
  diff.mockResolvedValue({ threadId: id, fromTurnCount: 0, toTurnCount: 2, diff: "sample\n" });
  const text = await run(["diff", "thread-1"], false);
  expect(text.stdout).toBe("sample\n");
  expect(diff).toHaveBeenLastCalledWith(id, undefined);
  await run(["diff", "thread-1", "--from-turn", "1", "--to-turn", "2"]);
  expect(diff).toHaveBeenLastCalledWith(id, { fromTurnCount: 1, toTurnCount: 2 });
  await run(["diff", "thread-1", "--from-turn", "0", "--to-turn", "0"]);
  expect(diff).toHaveBeenLastCalledWith(id, { fromTurnCount: 0, toTurnCount: 0 });
});

it.each([
  ["diff", "thread-1", "--from-turn", "1"],
  ["diff", "thread-1", "--to-turn", "1"],
  ["diff", "thread-1", "--from-turn", "2", "--to-turn", "1"],
  ["diff", "thread-1", "--from-turn", "1.5", "--to-turn", "2"],
  ["diff", "thread-1", "--from-turn", "x", "--to-turn", "2"],
  ["diff", "thread-1", "--from-turn", "-1", "--to-turn", "2"],
  ["status", " "],
  ["usage", " "],
  ["requests", " "],
  ["search", "n"],
  ["search", "needle", "--limit", "0"],
  ["search", "needle", "--limit", "51"],
  ["search", "needle", "--limit", "many"],
  ["search", " ", "--thread", "thread-1"],
  ["search", "needle", "--thread", " "],
  ["search", "needle", "--thread", "thread-1", "--limit", "2"],
])("rejects malformed arguments before client creation: %j", async (...args) => {
  expect((await run(args)).code).toBe(2);
  expect(T3Client.create).not.toHaveBeenCalled();
});

it("searches across threads with a reported bound", async () => {
  const match = {
    threadId: id,
    projectId: "project-1" as never,
    source: "user" as const,
    snippet: "sample\nneedle",
    messageCreatedAt: null,
  };
  const search = vi
    .spyOn(client.threads, "search")
    .mockResolvedValue({ matches: [match], limit: 1 });
  const text = await run(["search", " needle ", "--limit", "1"], false);
  expect(search).toHaveBeenLastCalledWith({ query: "needle", limit: 1 });
  expect(text.stdout).toBe("thread-1\tproject-1\tuser\tsample needle\n");
  expect(text.stderr).toBe("Showing the limit of 1 threads; more may match.\n");
  search.mockResolvedValue({ matches: [], limit: 50 });
  const json = await run(["search", "needle"]);
  expect(search).toHaveBeenLastCalledWith({ query: "needle" });
  expect(json.result).toEqual({ data: { matches: [], limit: 50 }, exitCode: 0 });
  expect(json.stderr).toBe("");
});

it("searches within one thread through the native find", async () => {
  const result = {
    snapshotSequence: 2,
    totalMatches: 3,
    activeIndex: 0,
    match: { entryId: "entry-1", runId: null, occurrence: 0 },
  };
  const find = vi.spyOn(client.threads, "searchContent").mockResolvedValue(result as never);
  const text = await run(["search", "needle", "--thread", "thread-1"], false);
  expect(find).toHaveBeenCalledWith({ threadId: id, query: "needle" });
  expect(text.stdout).toBe("matches\t3\nfirst\tentry-1\t-\t0\n");
  expect((await run(["search", "needle", "--thread", "thread-1"])).result.data).toEqual(result);
});

it("preserves not found and connection failures", async () => {
  for (const [method, args] of [
    ["status", ["status", "thread-1"]],
    ["usage", ["usage", "thread-1"]],
    ["diff", ["diff", "thread-1"]],
  ] as const) {
    const spy = vi.spyOn(client.threads, method);
    spy.mockRejectedValue(
      new T3NotFoundError("Thread not found.", {
        status: 404,
        method: "GET",
        path: "/api/orchestration/threads/thread-1",
        body: null,
      }),
    );
    let result = await run([...args]);
    expect(result.code).toBe(10);
    expect(result.result.error).toBeDefined();
    spy.mockRejectedValue(new T3ConnectionError("open_failed", "sample failure"));
    result = await run([...args]);
    expect(result.code).toBe(8);
  }
});
