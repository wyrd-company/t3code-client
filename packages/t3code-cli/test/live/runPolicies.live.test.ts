// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { threadId } from "@wyrd-company/t3code-lib";
import {
  agent,
  client,
  directory,
  execute,
  issuer,
  ownedProjects,
  record,
  runCommand,
  useDispatchHarness,
} from "./dispatchHarness.ts";

useDispatchHarness("policies");

it.skipIf(!agent)("run prepares a worktree from the supplied base ref", async () => {
  const root = NodePath.join(directory, "sample-repository");
  await NodeFSP.mkdir(root);
  const author = ["-c", "user.name=Sample", "-c", "user.email=sample@example.invalid"];
  for (const args of [
    ["init", "--initial-branch=sample-base"],
    [...author, "commit", "--allow-empty", "-m", "Initial commit"],
  ])
    NodeChildProcess.execFileSync("git", args, { cwd: root, stdio: "ignore" });
  for (const base of ["sample-base", undefined]) {
    const value = await execute(`worktree ${base ?? "default HEAD"}`, [
      ...runCommand,
      "Reply SAMPLE only.",
      "--project-path",
      root,
      "--worktree",
      ...(base ? ["--base-ref", base] : []),
    ]);
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
    expect(await NodeFSP.stat(projection.thread.worktreePath!).catch(() => null)).toBeNull();
  }
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

it.skipIf(!agent)("run applies accept and reject to live shell approvals", async () => {
  const root = NodePath.join(directory, "approval-workspace");
  await NodeFSP.mkdir(root);
  for (const policy of ["accept", "reject"]) {
    // A shell write outside the workspace induces the same approval used by inspection proof.
    const file = NodePath.join(directory, `approval-${policy}.txt`);
    const value = await execute(`approval ${policy}`, [
      ...runCommand,
      `Use a shell command to write SAMPLE to ${file}. Request approval if required. If denied, do not retry or use another tool. Reply SAMPLE only.`,
      "--project-path",
      root,
      "--mode",
      "approval-required",
      "--approve",
      policy,
    ]);
    const projection = await client.threads.projection(threadId(value.threadId));
    ownedProjects.add(projection.thread.projectId);
    const requests = projection.runtimeRequests.filter((request) => request.kind === "command");
    record({ case: `approval ${policy} requests`, threadId: value.threadId, requests });
    expect(requests.length).toBeGreaterThan(0);
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "resolved",
          decision: policy === "accept" ? "accept" : "decline",
        }),
      ]),
    );
    expect(value).toMatchObject({
      exitCode: 0,
      runtimeMode: "approval-required",
      state: "completed",
    });
  }
});
