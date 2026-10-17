// ---
// relationships:
//   verifies: command-contract
// ---
import * as NodeFSP from "node:fs/promises";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  schemas,
  T3Client,
  T3AuthError,
  T3ConnectionError,
  T3NotFoundError,
} from "@wyrd-company/t3code-lib";
import { main } from "../../main.ts";
import type { CommandSurface } from "../../registration.ts";
import { executionHandlers } from "../index.ts";
import {
  at,
  makeShellProject,
  makeShellThread,
  items,
  makeProjection,
} from "../../../../t3code-lib/test/support/threadFixtures.ts";
const surface = JSON.parse(
  await NodeFSP.readFile(
    new URL("../../../../../specifications/assets/cli-surface.json", import.meta.url),
    "utf8",
  ),
) as CommandSurface;
const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
afterEach(() => vi.restoreAllMocks());
async function run(args: string[], json = true) {
  vi.spyOn(T3Client, "create").mockReturnValue(client);
  vi.spyOn(client, "close").mockResolvedValue();
  const stdout: string[] = [],
    stderr: string[] = [];
  const code = await main(
    [...args, "--server", "http://127.0.0.1:1", ...(json ? ["--json"] : [])],
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
it("lists and ensures server projects through the library", async () => {
  const project = makeShellProject();
  vi.spyOn(client.projects, "list").mockResolvedValue([project]);
  const ensure = vi.spyOn(client.projects, "ensure").mockResolvedValue(project);
  expect((await run(["project", "list"])).result).toEqual({ data: [project], exitCode: 0 });
  expect((await run(["project", "list"], false)).stdout).toContain(project.workspaceRoot);
  expect((await run(["project", "ensure", "/server/workspace/"])).code).toBe(0);
  expect(ensure).toHaveBeenCalledWith({ workspaceRoot: "/server/workspace/", title: "workspace" });
});
it("prints the complete environment descriptor and live catalog", async () => {
  const environment = schemas.environment.ExecutionEnvironmentDescriptor.parse(
    JSON.parse(
      await NodeFSP.readFile(
        new URL("../../../../t3code-lib/test/fixtures/environment.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  const config = schemas.server.ServerConfig.parse(
    JSON.parse(
      await NodeFSP.readFile(
        new URL("../../../../t3code-lib/test/fixtures/server-config.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  vi.spyOn(client.server, "environment").mockResolvedValue(environment);
  vi.spyOn(client.server, "providers").mockResolvedValue(config.providers);
  expect((await run(["server", "info"])).result).toEqual({
    data: { environment, providers: config.providers },
    exitCode: 0,
  });
  expect((await run(["server", "info"], false)).stdout).toContain("models");
});
it("reports live environment and providers without filtering models", async () => {
  const environment = vi
    .spyOn(client.server, "environment")
    .mockRejectedValue(new T3ConnectionError("open_failed", "sample"));
  vi.spyOn(client.server, "providers").mockResolvedValue([]);
  expect((await run(["server", "info"])).code).toBe(8);
  expect(environment).toHaveBeenCalledOnce();
});
it("lists thread summaries, renders their phase and requests interruption without holding the queue", async () => {
  const thread = makeShellThread();
  vi.spyOn(client.threads, "list").mockResolvedValue([thread]);
  expect((await run(["thread", "list"])).result.data).toEqual([thread]);
  expect((await run(["thread", "list"], false)).stdout).toContain(thread.title);
  const interrupt = vi.spyOn(client.threads, "interrupt").mockResolvedValue();
  expect((await run(["thread", "interrupt", "sample"])).result).toEqual({
    data: { threadId: "sample" },
    exitCode: 0,
  });
  expect(interrupt).toHaveBeenCalledWith("sample");
});
it("reads an empty transcript, and preserves missing thread and auth errors", async () => {
  const read = vi.spyOn(client.threads, "transcript").mockResolvedValue({
    threadId: makeShellThread().id,
    title: "Sample",
    updatedAt: at,
    items: [],
  });
  expect((await run(["thread", "read", "sample"])).result.data).toEqual([]);
  expect((await run(["thread", "read", "sample", "--last"])).result.data).toBeNull();
  for (const [error, code] of [
    [new T3NotFoundError("sample", { status: 404, method: "GET", path: "/", body: null }), 10],
    [T3AuthError.insufficientScope("orchestration:read", "sample"), 9],
  ] as const) {
    read.mockRejectedValue(error);
    expect((await run(["thread", "read", "absent"])).code).toBe(code);
  }
});
it.each([
  ["--accept", "--reject"],
  ["--accept", "--answer", "q=a"],
  [],
  ["--answer", "missing"],
  ["--answer", "=value"],
  ["--answer", " =value"],
])("rejects wrong response combinations before client creation: %j", async (...flags) => {
  const result = await run(["thread", "respond", "sample", "--request", "request", ...flags]);
  expect(result.code).toBe(2);
  expect(T3Client.create).not.toHaveBeenCalled();
});
it("passes explicit keyed answers and approval decisions to library response methods", async () => {
  const input = vi.spyOn(client.threads, "respondToUserInput").mockResolvedValue();
  const approval = vi.spyOn(client.threads, "respondToApproval").mockResolvedValue();
  expect(
    (
      await run([
        "thread",
        "respond",
        "sample",
        "--request",
        "request",
        "--answer",
        "q1=a=b",
        "--answer",
        "q2=",
        "--answer",
        "__proto__=safe",
      ])
    ).code,
  ).toBe(0);
  expect(input).toHaveBeenCalledWith({
    threadId: "sample",
    requestId: "request",
    answers: { q1: "a=b", q2: "", ["__proto__"]: "safe" },
  });
  for (const [flag, decision] of [
    ["--accept", "accept"],
    ["--reject", "decline"],
  ]) {
    expect((await run(["thread", "respond", "sample", "--request", "request", flag!])).code).toBe(
      0,
    );
    expect(approval).toHaveBeenLastCalledWith({
      threadId: "sample",
      requestId: "request",
      decision,
    });
  }
  expect((await run(["thread", "read", "sample", "--last", "--full"])).code).toBe(2);
});

it("rejects blank directories and missing request ids before connecting", async () => {
  for (const args of [
    ["project", "ensure", " "],
    ["thread", "respond", "sample", "--accept"],
    ["thread", "respond", "sample", "--request", " ", "--accept"],
  ]) {
    expect((await run(args)).code).toBe(2);
    expect(T3Client.create).not.toHaveBeenCalled();
  }
});
it("renders the full conversation and the last assistant message as text", async () => {
  const projection = makeProjection({
    visibleTurnItems: [
      {
        position: 0,
        visibility: "local",
        sourceThreadId: "sample",
        sourceItemId: "item-1",
        item: items.assistantMessage("SAMPLE", false),
      },
    ],
  });
  vi.spyOn(client.threads, "transcript").mockResolvedValue({
    threadId: makeShellThread().id,
    title: "Sample",
    updatedAt: at,
    items: projection.visibleTurnItems,
  });
  expect((await run(["thread", "read", "sample"], false)).stdout).toBe("assistant: SAMPLE\n");
  expect((await run(["thread", "read", "sample", "--last"], false)).stdout).toBe("SAMPLE\n");
});
