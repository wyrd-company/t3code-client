// ---
// relationships:
//   verifies: request-watch
// ---
import * as NodeFSP from "node:fs/promises";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  memoryCredentialStore,
  ProfileManager,
  schemas,
  T3AuthError,
  T3Client,
  T3ConnectionError,
  T3DecodeError,
  T3StorageError,
  projectId,
  threadId,
  type ReportedRequest,
  type RequestWatchItem,
} from "@wyrd-company/t3code-lib";
import { main } from "../main.ts";
import type { CommandSurface } from "../registration.ts";
import { requestsHandlers } from "./index.ts";

const surface = JSON.parse(
  await NodeFSP.readFile(
    new URL("../../../../docs/specifications/cli-surface.json", import.meta.url),
    "utf8",
  ),
) as CommandSurface;
const at = "2026-01-01T00:00:00.000Z";
const project = {
  id: projectId("project-1"),
  title: "Sample project",
  workspaceRoot: "/workspace/sample",
  defaultModelSelection: null,
  scripts: [],
  createdAt: at,
  updatedAt: at,
  deletedAt: null,
};
const approval: ReportedRequest = {
  kind: "approval",
  requestId: schemas.common.RuntimeRequestId.parse("request-1"),
  thread: { id: threadId("thread-1"), title: "Sample thread\nsecond line", tags: ["sample"] },
  project: { id: project.id, title: project.title },
  request: schemas.orchestrationProviderState.OrchestrationV2RuntimeRequest.parse({
    id: "request-1",
    kind: "command",
    status: "pending",
    nodeId: "node-1",
    providerTurnId: "provider-turn-1",
    nativeRequestRef: null,
    responseCapability: { type: "message" },
    createdAt: at,
    resolvedAt: null,
  }),
  item: undefined,
};

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const baseUrl = "http://127.0.0.1:1";
  const client = T3Client.create({ baseUrl });
  const create = vi.spyOn(T3Client, "create").mockReturnValue(client);
  const resolve = vi.spyOn(ProfileManager.prototype, "resolve").mockResolvedValue({
    baseUrl,
    credentials: memoryCredentialStore(),
    sources: { server: "profile", credentials: "profile" },
  });
  const close = vi.spyOn(client, "close").mockResolvedValue();
  const snapshot = vi
    .spyOn(client.projects, "snapshot")
    .mockResolvedValue({ projects: [project], updatedAt: at });
  const watch = vi.spyOn(client.requests, "watch").mockImplementation(async function* () {
    yield { kind: "synchronized" };
  });
  const stdout: string[] = [];
  const stderr: string[] = [];
  async function run(flags: string[], json = true) {
    const code = await main(
      ["requests", "watch", ...flags, ...(json ? ["--json"] : [])],
      surface,
      { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
      requestsHandlers,
    );
    return {
      code,
      stdout,
      stderr,
      lines: stdout.flatMap((text) => text.trimEnd().split("\n")).map((line) => JSON.parse(line)),
    };
  }
  return { run, create, resolve, close, snapshot, watch, stdout, stderr };
}

it.each([false, true])(
  "serializes one schema-matching line per report in both modes (%s)",
  async (json) => {
    const f = fixture();
    const question: ReportedRequest = {
      ...approval,
      kind: "user-input",
      requestId: schemas.common.RuntimeRequestId.parse("request-2"),
      request: {
        ...approval.request,
        id: schemas.common.RuntimeRequestId.parse("request-2"),
        kind: "user_input",
      },
      project: { ...approval.project, title: null },
      item: undefined,
      questions: [
        {
          id: "question-1",
          header: "Destination",
          question: "Where should the sample go?",
          options: [{ label: "Drafts", description: "Save to drafts." }],
        },
      ],
    };
    const items: RequestWatchItem[] = [
      { kind: "request", request: approval },
      { kind: "request", request: question },
      { kind: "synchronized" },
      { kind: "reconnected" },
    ];
    f.watch.mockImplementation(async function* () {
      yield* items;
      throw new T3ConnectionError("closed", "Sample connection closed.");
    });
    const { code, stdout, stderr, lines } = await f.run(["--log-level", "info"], json);
    expect(code).toBe(8);
    expect(stdout).toHaveLength(json ? 3 : 2);
    for (const line of stdout) expect(line).toMatch(/^[^\n]+\n$/u);
    expect(lines.slice(0, 2)).toEqual([
      { type: "request", ...approval, item: null },
      { type: "request", ...question, item: null },
    ]);
    if (json)
      expect(lines[2]).toEqual({
        type: "result",
        data: { reported: 2, hooks: null },
        exitCode: 8,
        error: { code: "connection", message: "Server connection failed." },
      });
    expect(stderr).toEqual([
      "t3c: watching for requests\n",
      "t3c: reconnected\n",
      "t3c: Server connection failed.\n",
    ]);
    expect(f.close).toHaveBeenCalledTimes(1);
  },
);

it("preflights the projects and passes normalized filters and the same signal to the library", async () => {
  const f = fixture();
  const options = [
    "--project",
    " project-1 ",
    "--project",
    "project-1",
    "--kind",
    "approval",
    "--exclude-thread",
    " worker ",
    "--exclude-thread",
    "worker",
    "--exclude-tag",
    " reviewer ",
    "--exclude-tag",
    "reviewer",
    "--exclude-tag",
    "Reviewer",
  ];
  const { code } = await f.run(options);
  expect(code).toBe(1);
  expect(f.snapshot).toHaveBeenCalledTimes(1);
  const signal = f.snapshot.mock.calls[0]?.[0];
  expect(signal).toBeDefined();
  expect(signal?.aborted).toBe(true);
  expect(f.watch).toHaveBeenCalledExactlyOnceWith({
    projectIds: ["project-1"],
    kind: "approval",
    excludeThreadIds: ["worker"],
    excludeTags: ["reviewer", "Reviewer"],
    signal,
  });
  expect(f.snapshot).toHaveBeenCalledBefore(f.watch);
});

it.each([
  ["--project", " "],
  ["--exclude-thread", " "],
  ["--exclude-tag", "reviewer\nworker"],
  ["--kind", "unsupported"],
  ["--exec", " "],
  ["--exec-concurrency", "4"],
  ["--exec-timeout", "10m"],
  ["--exec", "exit 0", "--exec-timeout", "0"],
  ["--exec", "exit 0", "--exec-concurrency", "0"],
  ["--exec", "exit 0", "--exec-concurrency", "2.5"],
  ["--exec", "exit 0", "--exec-concurrency", "9007199254740992"],
])("rejects invalid input before connecting (%s)", async (...flags: string[]) => {
  const f = fixture();
  expect((await f.run(flags)).code).toBe(2);
  expect(f.resolve).not.toHaveBeenCalled();
  expect(f.create).not.toHaveBeenCalled();
});

it("names a missing selected project and never subscribes", async () => {
  const f = fixture();
  const { code, lines, stderr } = await f.run(["--project", "missing"]);
  expect(code).toBe(10);
  expect(lines).toEqual([
    {
      type: "result",
      data: { reported: 0, hooks: null },
      exitCode: 10,
      error: { code: "not_found", message: 'Selected project "missing" not found.' },
    },
  ]);
  expect(stderr).toEqual(['t3c: Selected project "missing" not found.\n']);
  expect(f.watch).not.toHaveBeenCalled();
});

const rejected = new T3AuthError("Sample credential was rejected.", {
  code: "auth_invalid",
  status: 401,
  method: "GET",
  path: "/api/projects",
  body: undefined,
});
const missingScope = T3AuthError.insufficientScope("orchestration:read", "Sample");
it.each([
  ["preflight", new T3ConnectionError("open_failed", "Sample"), 8],
  ["preflight", rejected, 9],
  ["preflight", missingScope, 9],
  ["preflight", new T3StorageError("Sample"), 1],
  ["watch", rejected, 8],
  ["watch", missingScope, 9],
] as const)("maps a %s failure (%s) to exit %s", async (stage, failure, exitCode) => {
  const f = fixture();
  if (stage === "preflight") f.snapshot.mockRejectedValue(failure);
  else
    f.watch.mockImplementation(() => {
      throw failure;
    });
  const { code, lines } = await f.run(["--exec", "exit 0"]);
  expect(code).toBe(exitCode);
  expect(lines).toEqual([
    expect.objectContaining({
      type: "result",
      data: { reported: 0, hooks: { succeeded: 0, failed: 0, stopped: 0, notRun: 0 } },
      exitCode,
    }),
  ]);
  if (stage === "preflight") expect(f.watch).not.toHaveBeenCalled();
});

it("warns about thread and decode failures, then stops watching on the first signal", async () => {
  const f = fixture();
  const invalid = schemas.common.ThreadId.safeParse(null);
  if (invalid.success) throw new Error("Expected an invalid thread id.");
  f.watch.mockImplementation(async function* (options) {
    yield { kind: "synchronized" };
    yield {
      kind: "thread-error",
      threadId: threadId("thread-1\nextra"),
      error: new T3StorageError("Sample\nerror."),
    };
    yield { kind: "decode-error", error: new T3DecodeError("Sample", invalid.error, null) };
    yield { kind: "request", request: approval };
    process.emit("SIGTERM");
    expect(options?.signal?.aborted).toBe(true);
    yield { kind: "request", request: approval };
  });
  const { code, stderr, lines } = await f.run([]);
  expect(code).toBe(4);
  expect(stderr).toEqual([
    't3c: could not watch thread "thread-1\\nextra": "Sample\\nerror."\n',
    "t3c: skipped a server item that could not be decoded\n",
    "t3c: Operation interrupted.\n",
  ]);
  expect(lines.map(({ type }) => type)).toEqual(["request", "result"]);
  expect(lines[1]).toEqual({
    type: "result",
    data: { reported: 1, hooks: null },
    exitCode: 4,
    error: { code: "interrupted", message: "Operation interrupted." },
  });
});

it("cancels preflight and closes the client on SIGINT", async () => {
  const f = fixture();
  f.snapshot.mockImplementation(async (signal) => {
    process.emit("SIGINT");
    expect(signal?.aborted).toBe(true);
    return { projects: [], updatedAt: at };
  });
  const { code, lines } = await f.run([]);
  expect(code).toBe(4);
  expect(lines).toEqual([expect.objectContaining({ type: "result", exitCode: 4 })]);
  expect(f.watch).not.toHaveBeenCalled();
  expect(f.close).toHaveBeenCalledTimes(1);
});
