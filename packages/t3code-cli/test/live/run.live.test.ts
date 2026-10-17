// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { ProfileManager, threadId } from "@wyrd-company/t3code-lib";
import {
  agent,
  cli,
  client,
  directory,
  execute,
  issuer,
  ownedProjects,
  ownedThreads,
  record,
  runCommand,
  startCommand,
  useDispatchHarness,
} from "./dispatchHarness.ts";

useDispatchHarness("run");

it.skipIf(!agent)("thread start exits once its server thread and linked run exist", async () => {
  for (const json of [true, false]) {
    const result = await cli([...startCommand, "Reply SAMPLE only.", ...(json ? ["--json"] : [])]);
    expect(result.exit).toBe(0);
    const id = json ? (JSON.parse(result.stdout).data.threadId as string) : result.stdout.trim();
    ownedThreads.add(id);
    const projection = await client.threads.projection(threadId(id));
    expect(projection.thread.id).toBe(id);
    const run = projection.runs.find((candidate) =>
      projection.messages.some(
        (message) =>
          message.role === "user" &&
          (message.runId === candidate.id || candidate.userMessageId === message.id),
      ),
    );
    expect(run).toBeDefined();
    if (json)
      expect(JSON.parse(result.stdout)).toEqual({
        data: { threadId: id, runId: run!.id, runtimeMode: expect.any(String) },
        exitCode: 0,
      });
    else expect(result.stdout).toBe(`${id}\n`);
    const { id: runId, status: state } = run!;
    record({ case: "thread start", json, threadId: id, runId, state, exit: result.exit });
  }
});

it("pre-dispatch failures create no server thread", async () => {
  const before = (await client.threads.list()).map((thread) => thread.id).sort();
  const cases: [string[], string, number][] = [
    [["--project", "missing-project"], "unknown project", 10],
    [["--provider", "codex", "--model", "missing-model"], "unknown model", 10],
    [["--server", "http://127.0.0.1:1", "--connect-timeout", "100ms"], "bad server", 8],
    [["--prompt-file", NodePath.join(directory, "missing.txt")], "unreadable file", 1],
  ];
  for (const [flags, label, code] of cases) {
    for (const path of [["run"], ["thread", "start"]]) {
      // File-only input is deliberately missing; other failures receive a prompt.
      const args = flags.includes("--prompt-file")
        ? [...path, ...flags, "--json"]
        : [...path, "sample prompt", ...flags, "--json"];
      const result = await cli(args);
      expect(result.exit).toBe(code);
      expect(JSON.parse(result.stdout)).toMatchObject(
        path[0] === "run"
          ? { threadId: null, runId: null, exitCode: code }
          : { data: null, exitCode: code },
      );
      record({ case: `${path.join(" ")} ${label}`, threadId: null, exit: code });
    }
  }
  expect((await client.threads.list()).map((thread) => thread.id).sort()).toEqual(before);
});

it("credential and scope refusals exit 9 without creating a thread", async () => {
  const before = (await client.threads.list()).map((thread) => thread.id).sort();
  const config = NodePath.join(directory, "limited");
  const profiles = new ProfileManager({ configDir: config });
  const pair = await issuer.auth.createPairingCredential({
    label: "sample-limited",
    scopes: ["orchestration:read"],
  });
  await profiles.pair({ name: "sample", url: process.env["T3_LIVE_URL"]! }, pair.credential);
  for (const [label, override] of [
    ["credential", { T3_TOKEN: "unrecognized-session" }],
    ["scope", { T3C_CONFIG_HOME: config }],
  ] as const) {
    const result = await cli([...startCommand, "sample prompt", "--json"], "", false, override);
    expect(result.exit).toBe(9);
    const value = JSON.parse(result.stdout);
    expect(value).toMatchObject({ data: null, exitCode: 9 });
    if (label === "scope") expect(value.error.requiredScope).toBe("orchestration:operate");
    else expect(value.error.code).toBe("auth_invalid");
    record({ case: label, threadId: null, exit: result.exit, error: value.error });
  }
  expect((await client.threads.list()).map((thread) => thread.id).sort()).toEqual(before);
});

it.skipIf(!agent)("run reads positional, stdin and files with clean output", async () => {
  const file = NodePath.join(directory, "prompt.txt");
  const prompt = "Reply SAMPLE only.";
  await NodeFSP.writeFile(file, prompt);
  const scratch = await client.projects.ensureScratch();
  for (const [flags, input, json] of [
    [[prompt], "", false],
    [[], prompt, false],
    [["--prompt-file", file], "", false],
    [[prompt], "", true],
    [["--prompt-file", "-"], prompt, true],
  ] as const) {
    const result = await cli([...runCommand, ...flags, ...(json ? ["--json"] : [])], input);
    expect(result.exit).toBe(0);
    let id: string;
    if (json) {
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
      const value = JSON.parse(result.stdout);
      expect(value).toMatchObject({ state: "completed", assistantMessage: "SAMPLE", exitCode: 0 });
      id = value.threadId;
    } else {
      expect(result.stdout).toBe("SAMPLE\n");
      id = /Thread: ([^\n]+)/.exec(result.stderr)![1]!;
    }
    ownedThreads.add(id);
    expect(result.stderr).toContain(`Thread: ${id}\n`);
    const projection = await client.threads.projection(threadId(id));
    expect(projection.thread.projectId).toBe(scratch.projectId);
    const run = projection.runs[0]!;
    record({
      case: `run ${flags.join(" ")} json=${json}`,
      threadId: id,
      runId: run.id,
      state: run.status,
      exit: result.exit,
    });
  }
});

it.skipIf(!agent)("run continuation and send follow linked runs on one thread", async () => {
  const first = await execute("first run explicit mode", [
    ...runCommand,
    "Reply SAMPLE only.",
    "--mode",
    "full-access",
    "--log-level",
    "info",
  ]);
  expect(first.runtimeMode).toBe("full-access");
  const next = await execute("continuation", [
    ...runCommand,
    "Reply NEXT only.",
    "--thread",
    first.threadId,
  ]);
  expect(first.exitCode).toBe(0);
  expect(next.exitCode).toBe(0);
  expect(next.runtimeMode).toBeNull();
  expect(next.threadId).toBe(first.threadId);
  expect(next.runId).not.toBe(first.runId);
  expect(next.assistantMessage).toBe("NEXT");
  const sent = await execute("send", ["thread", "send", first.threadId, "Reply SENT only."]);
  expect(sent).toMatchObject({
    threadId: first.threadId,
    assistantMessage: "SENT",
    state: "completed",
    runtimeMode: null,
    exitCode: 0,
  });
  expect(sent.runId).not.toBe(next.runId);
  expect((await client.threads.projection(threadId(first.threadId))).runs).toHaveLength(3);
});

it.skipIf(!agent)("thread start --wait uses project-path and run output", async () => {
  const root = NodePath.join(directory, "sample-workspace");
  await NodeFSP.mkdir(root);
  const value = await execute("start wait project-path", [
    ...startCommand,
    "Reply SAMPLE only.",
    "--project-path",
    root,
    "--wait",
  ]);
  expect(value).toMatchObject({ assistantMessage: "SAMPLE", state: "completed", exitCode: 0 });
  expect(value.runtimeMode).toBe((await client.server.getSettings())["defaultRuntimeMode"] ?? null);
  const projection = await client.threads.projection(threadId(value.threadId));
  ownedProjects.add(projection.thread.projectId);
  expect((await client.projects.get(projection.thread.projectId))?.workspaceRoot).toBe(root);
  expect(projection.thread.worktreePath).toBeNull();
});
