// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { ProfileManager, T3Client, threadId } from "@wyrd-company/t3code-lib";

let directory: string;
let client: T3Client;
let issuer: T3Client;
let env: NodeJS.ProcessEnv;
const ownedThreads = new Set<string>();
const records: Record<string, unknown>[] = [];
function record(value: Record<string, unknown>) {
  records.push(value);
  console.log(JSON.stringify(value));
}
const selection = ["--provider", "codex", "--model", "gpt-6-luna"];
const agent = process.env["T3_LIVE_AGENT"] === "1";

beforeAll(async () => {
  directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-dispatch-"));
  const url = process.env["T3_LIVE_URL"]!;
  issuer = T3Client.create({ baseUrl: url, accessToken: process.env["T3_LIVE_TOKEN"]! });
  const profiles = new ProfileManager({ configDir: NodePath.join(directory, "config") });
  const pair = await issuer.auth.createPairingCredential({
    label: "sample-dispatch",
    scopes: ["orchestration:read", "orchestration:operate"],
  });
  await profiles.pair({ name: "sample", url }, pair.credential);
  client = T3Client.create(await profiles.resolve({ env: {} }));
  env = {
    ...process.env,
    T3C_CONFIG_HOME: NodePath.join(directory, "config"),
    T3_SERVER_URL: "",
    T3_TOKEN: "",
  };
});
afterAll(async () => {
  try {
    for (const id of ownedThreads) {
      await client.threads.interrupt(threadId(id), undefined, { holdQueue: true }).catch(() => {});
      await client.threads.delete(threadId(id)).catch(() => {});
    }
  } finally {
    if (process.env["T3C_DISPATCH_EVIDENCE"])
      await NodeFSP.writeFile(
        process.env["T3C_DISPATCH_EVIDENCE"],
        JSON.stringify(records, null, 2),
      );
    await client?.close();
    await issuer?.close();
    if (directory) await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});

function cli(
  args: string[],
  input = "",
  signalAfterDispatch = false,
): Promise<{ stdout: string; stderr: string; exit: number }> {
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(process.execPath, ["dist/cli.js", ...args], {
      env,
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
    const result = await cli([
      "thread",
      "start",
      "Reply SAMPLE only.",
      ...selection,
      ...(json ? ["--json"] : []),
    ]);
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
        data: { threadId: id, runId: run!.id },
        exitCode: 0,
      });
    else expect(result.stdout).toBe(`${id}\n`);
    record({
      case: "thread start",
      json,
      threadId: id,
      runId: run!.id,
      state: run!.status,
      exit: result.exit,
    });
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
    // File-only input is deliberately missing; other failures receive a prompt.
    const args = flags.includes("--prompt-file")
      ? ["thread", "start", ...flags, "--json"]
      : ["thread", "start", "sample prompt", ...flags, "--json"];
    const result = await cli(args);
    expect(result.exit).toBe(code);
    expect(JSON.parse(result.stdout)).toMatchObject({ data: null, exitCode: code });
    record({ case: label, threadId: null, exit: code });
  }
  expect((await client.threads.list()).map((thread) => thread.id).sort()).toEqual(before);
});
