// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { ProfileManager, T3Client, threadId, type ProjectId } from "@wyrd-company/t3code-lib";

let directory: string;
let client: T3Client;
let issuer: T3Client;
let env: NodeJS.ProcessEnv;
const ownedThreads = new Set<string>();
const ownedProjects = new Set<ProjectId>();
const records: Record<string, unknown>[] = [];
const evidenceFile = process.env["T3C_DISPATCH_EVIDENCE"];
function record(value: Record<string, unknown>) {
  records.push(value);
  console.log(JSON.stringify(value));
}
const selection = ["--provider", "codex", "--model", "gpt-6-luna"];
const runCommand = ["run", ...selection];
const startCommand = ["thread", "start", ...selection];
const agent = process.env["T3_LIVE_AGENT"] === "1";

beforeAll(async () => {
  directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-dispatch-"));
  const url = process.env["T3_LIVE_URL"]!;
  issuer = T3Client.create({ baseUrl: url, accessToken: process.env["T3_LIVE_TOKEN"]! });
  const configHome = NodePath.join(directory, "config");
  const profiles = new ProfileManager({ configDir: configHome });
  const pair = await issuer.auth.createPairingCredential({
    label: "sample-dispatch",
    scopes: ["orchestration:read", "orchestration:operate"],
  });
  await profiles.pair({ name: "sample", url }, pair.credential);
  client = T3Client.create(await profiles.resolve({ env: {} }));
  env = { ...process.env, T3C_CONFIG_HOME: configHome, T3_SERVER_URL: "", T3_TOKEN: "" };
});
afterAll(async () => {
  try {
    for (const id of ownedThreads) {
      await client.threads.interrupt(threadId(id), undefined, { holdQueue: true }).catch(() => {});
      await client.threads.delete(threadId(id)).catch(() => {});
    }
    for (const id of ownedProjects) await client.projects.delete(id).catch(() => {});
  } finally {
    if (evidenceFile) await NodeFSP.writeFile(evidenceFile, JSON.stringify(records, null, 2));
    await client?.close();
    await issuer?.close();
    if (directory) await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});

function cli(
  args: string[],
  input = "",
  signalAfterDispatch = false,
  overrides: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string; exit: number }> {
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(process.execPath, ["dist/cli.js", ...args], {
      env: { ...env, ...overrides },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      signalled = false;
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (signalAfterDispatch && !signalled && stderr.includes("Thread: ")) {
        signalled = true;
        child.kill("SIGTERM");
      }
    });
    child.once("error", reject);
    child.once("exit", (exit, signal) =>
      signal
        ? reject(new Error(`CLI killed by ${signal}`))
        : resolve({ stdout, stderr, exit: exit ?? 1 }),
    );
    child.stdin.end(input);
  });
}

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
async function execute(label: string, args: string[], signal = false) {
  const result = await cli([...args, "--json"], "", signal);
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  const value = JSON.parse(result.stdout);
  const { threadId, runId, state, runtimeMode } = value;
  if (typeof threadId === "string") ownedThreads.add(threadId);
  record({ case: label, threadId, runId, state, runtimeMode, exit: result.exit });
  expect(value.exitCode).toBe(result.exit);
  return value;
}

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
  const first = await execute("first run", [...runCommand, "Reply SAMPLE only."]);
  const next = await execute("continuation", [
    ...runCommand,
    "Reply NEXT only.",
    "--thread",
    first.threadId,
  ]);
  expect(first.exitCode).toBe(0);
  expect(next.exitCode).toBe(0);
  expect(next.threadId).toBe(first.threadId);
  expect(next.runId).not.toBe(first.runId);
  expect(next.assistantMessage).toBe("NEXT");
  const sent = await execute("send", ["thread", "send", first.threadId, "Reply SENT only."]);
  expect(sent).toMatchObject({
    threadId: first.threadId,
    assistantMessage: "SENT",
    state: "completed",
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
  const projection = await client.threads.projection(threadId(value.threadId));
  ownedProjects.add(projection.thread.projectId);
  expect((await client.projects.get(projection.thread.projectId))?.workspaceRoot).toBe(root);
  expect(projection.thread.worktreePath).toBeNull();
});

it.skipIf(!agent)("run prepares a worktree from the supplied base ref", async () => {
  const root = NodePath.join(directory, "sample-repository");
  await NodeFSP.mkdir(root);
  const author = ["-c", "user.name=Sample", "-c", "user.email=sample@example.invalid"];
  for (const args of [
    ["init", "--initial-branch=sample-base"],
    [...author, "commit", "--allow-empty", "-m", "Initial commit"],
  ])
    NodeChildProcess.execFileSync("git", args, { cwd: root, stdio: "ignore" });
  const args = [
    "Reply SAMPLE only.",
    "--project-path",
    root,
    "--worktree",
    "--base-ref",
    "sample-base",
  ];
  const value = await execute("worktree base ref", [...runCommand, ...args]);
  expect(value).toMatchObject({ assistantMessage: "SAMPLE", state: "completed", exitCode: 0 });
  const projection = await client.threads.projection(threadId(value.threadId));
  expect(projection.thread.worktreePath).toBeTruthy();
  expect(projection.thread.worktreePath).not.toBe(root);
  ownedProjects.add(projection.thread.projectId);
  expect(projection.runs[0]!.id).toBe(value.runId);
  await issuer.vcs.removeWorktree({
    cwd: root,
    path: projection.thread.worktreePath!,
    force: true,
  });
});

it.skipIf(!agent)("run applies timeout interrupt/detach and SIGTERM policies", async () => {
  const prompt = "Run the shell command sleep 20, then reply SAMPLE only.";
  for (const [policy, expected] of [
    [undefined, 6],
    ["detach", 5],
  ] as const) {
    const args = [
      ...runCommand,
      prompt,
      "--timeout",
      "1s",
      ...(policy ? ["--on-timeout", policy] : []),
    ];
    const value = await execute(policy ?? "default interrupt", args);
    expect(value.exitCode).toBe(expected);
    expect(value.threadId).toBeTruthy();
    expect(value.runId).toBeTruthy();
    const projection = await client.threads.projection(threadId(value.threadId));
    const run = projection.runs.find((candidate) => candidate.id === value.runId);
    expect(run).toBeDefined();
    if (policy === "detach")
      expect(["preparing", "queued", "starting", "running", "waiting"]).toContain(run!.status);
    await client.threads.interrupt(threadId(value.threadId), undefined, { holdQueue: true });
  }
  const signalled = await execute("SIGTERM run", [...runCommand, prompt], true);
  expect(signalled.exitCode).toBe(4);
  expect(signalled.threadId).toBeTruthy();
});
