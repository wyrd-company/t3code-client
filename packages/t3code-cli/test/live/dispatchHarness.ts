// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, expect } from "vite-plus/test";
import { ProfileManager, T3Client, threadId, type ProjectId } from "@wyrd-company/t3code-lib";

/** Shared owned-server harness for the dispatch live suites; each test file gets its own state. */
export let directory: string;
export let client: T3Client;
export let issuer: T3Client;
let env: NodeJS.ProcessEnv;
let suiteName: string;
let commandIndex = 0;
export const ownedThreads = new Set<string>();
export const ownedProjects = new Set<ProjectId>();
const records: Record<string, unknown>[] = [];
const evidenceBase = process.env["T3C_DISPATCH_EVIDENCE"];
export function record(value: Record<string, unknown>) {
  records.push(value);
  console.log(JSON.stringify(value));
}
export const selection = ["--provider", "codex", "--model", "gpt-6-luna"];
export const runCommand = ["run", ...selection];
export const startCommand = ["thread", "start", ...selection];
export const agent = process.env["T3_LIVE_AGENT"] === "1";

/** Registers owned setup and cleanup; evidence goes to `<T3C_DISPATCH_EVIDENCE>.<suite>.json`. */
export function useDispatchHarness(suite: string): void {
  suiteName = suite;
  const evidenceFile = evidenceBase && `${evidenceBase}.${suite}.json`;
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
        await client.threads
          .interrupt(threadId(id), undefined, { holdQueue: true })
          .catch(() => {});
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
}

export function cli(
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
    child.once("close", async (exit, signal) => {
      try {
        const evidence = process.env["T3C_COMMAND_EVIDENCE"];
        if (evidence) {
          await NodeFSP.mkdir(evidence, { recursive: true });
          await NodeFSP.writeFile(
            NodePath.join(evidence, `${suiteName}-${++commandIndex}.json`),
            JSON.stringify({ args, input, stdout, stderr, exit, signal }, null, 2),
          );
        }
        if (signal) reject(new Error(`CLI killed by ${signal}`));
        else resolve({ stdout, stderr, exit: exit ?? 1 });
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(input);
  });
}

export async function execute(label: string, args: string[], signal = false) {
  const result = await cli([...args, "--json"], "", signal);
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  const value = JSON.parse(result.stdout);
  const { threadId, runId, state, runtimeMode } = value;
  if (typeof threadId === "string") ownedThreads.add(threadId);
  record({ case: label, threadId, runId, state, runtimeMode, exit: result.exit });
  expect(value.exitCode).toBe(result.exit);
  expect(result.stderr.match(/Thread: /g)).toHaveLength(1);
  if (args.includes("info"))
    expect(result.stderr).toContain(`Runtime mode: ${value.runtimeMode}\n`);
  else expect(result.stderr).not.toContain("Runtime mode:");
  return value;
}
