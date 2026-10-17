// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import {
  T3Client,
  ProfileManager,
  providerInstanceId,
  threadId,
  activeRun,
  isRunTerminalStatus,
} from "@wyrd-company/t3code-lib";

it("waits, detaches, interrupts, handles SIGINT and reports idle against an owned server", async () => {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-wait-profile-"));
  const url = process.env["T3_LIVE_URL"]!;
  const issuer = T3Client.create({ baseUrl: url, accessToken: process.env["T3_LIVE_TOKEN"]! });
  let client: T3Client | undefined;
  const created: string[] = [];
  const evidence: unknown[] = [];
  function record(data: unknown) {
    evidence.push(data);
    console.log(JSON.stringify(data));
  }
  try {
    const pair = await issuer.auth.createPairingCredential({
      label: "sample-wait",
      scopes: ["orchestration:read", "orchestration:operate"],
    });
    const profiles = new ProfileManager({ configDir: directory });
    await profiles.pair({ name: "sample", url }, pair.credential);
    client = T3Client.create(await profiles.resolve({ env: {} }));
    const connected = client;
    const env = { ...process.env, T3C_CONFIG_HOME: directory, T3_SERVER_URL: "", T3_TOKEN: "" };
    const { projectId } = await client.projects.ensureScratch();
    async function subject(
      prompt?: string,
      mode: "full-access" | "approval-required" = "full-access",
    ) {
      const thread = await connected.threads.create({
        projectId,
        title: "Sample wait",
        runtimeMode: mode,
        modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
      });
      created.push(thread.id);
      if (prompt) await connected.threads.startTurn({ threadId: thread.id, text: prompt });
      return thread.id;
    }
    function run(id: string, options: string[] = [], signal = false) {
      return new Promise<{ code: number | null; stdout: string; stderr: string }>(
        (resolve, reject) => {
          const child = NodeChildProcess.spawn(
            process.execPath,
            ["dist/cli.js", "thread", "wait", id, ...options],
            { env },
          );
          let stdout = "",
            stderr = "";
          let sent = false;
          child.stdout.on("data", (chunk) => {
            stdout += String(chunk);
          });
          child.stderr.on("data", (chunk) => {
            stderr += String(chunk);
            if (signal && !sent && stderr.includes(`Thread: ${id}`)) {
              sent = true;
              child.kill("SIGINT");
            }
          });
          child.on("error", reject);
          child.on("close", (code) => resolve({ code, stdout, stderr }));
        },
      );
    }
    async function state(id: string) {
      const p = await connected.threads.projection(threadId(id));
      return activeRun(p)?.status ?? p.runs.at(-1)?.status ?? "idle";
    }
    async function terminal(id: string) {
      for (let i = 0; i < 100; i++) {
        const value = await state(id);
        if (isRunTerminalStatus(value)) return value;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return state(id);
    }
    const idle = await subject();
    const idleResult = await run(idle, ["--json"]);
    expect(idleResult.code).toBe(0);
    expect(JSON.parse(idleResult.stdout)).toMatchObject({
      state: "idle",
      runId: null,
      exitCode: 0,
    });
    record({
      scenario: "wait-idle",
      threadId: idle,
      state: "idle",
      exit: idleResult.code,
    });
    if (process.env["T3_LIVE_AGENT"] !== "1") return;
    const completed = await subject("Reply with SAMPLE only.");
    const completedResult = await run(completed);
    expect(completedResult.code).toBe(0);
    expect(completedResult.stdout.trim()).toBe("SAMPLE");
    expect(completedResult.stdout).not.toContain(completed);
    expect(completedResult.stderr).toContain(completed);
    record({
      scenario: "wait-completion",
      threadId: completed,
      state: await state(completed),
      exit: completedResult.code,
    });
    const longPrompt =
      "Use the shell tool to sleep for 30 seconds, then reply SAMPLE only. Do not skip the sleep.";
    const detached = await subject(longPrompt);
    const detachedResult = await run(detached, ["--timeout", "1s", "--json"]);
    expect(detachedResult.code).toBe(5);
    expect(JSON.parse(detachedResult.stdout)).toMatchObject({ threadId: detached, exitCode: 5 });
    expect(isRunTerminalStatus(await state(detached))).toBe(false);
    record({
      scenario: "wait-detach",
      threadId: detached,
      state: await state(detached),
      exit: detachedResult.code,
    });
    await connected.threads.stop(threadId(detached));
    const interrupted = await subject(longPrompt);
    const interruptedResult = await run(interrupted, [
      "--timeout",
      "1s",
      "--on-timeout",
      "interrupt",
      "--json",
    ]);
    expect(interruptedResult.code).toBe(6);
    expect(await terminal(interrupted)).toBe("interrupted");
    record({
      scenario: "wait-interrupt",
      threadId: interrupted,
      state: await state(interrupted),
      exit: interruptedResult.code,
    });
    const signalled = await subject(longPrompt);
    const signalResult = await run(signalled, ["--json"], true);
    expect(signalResult.code).toBe(4);
    expect(await terminal(signalled)).toBe("interrupted");
    record({
      scenario: "wait-signal",
      threadId: signalled,
      state: await state(signalled),
      exit: signalResult.code,
    });
    const approval = await subject(
      `Use a shell command to write SAMPLE to ${NodePath.join(directory, "approval-proof.txt")}. Request approval if required.`,
      "approval-required",
    );
    const approvalResult = await run(approval, ["--timeout", "30s", "--json"]);
    const approvalEnvelope = JSON.parse(approvalResult.stdout);
    if (approvalResult.code === 7) expect(approvalEnvelope.pendingRequests).not.toHaveLength(0);
    else
      console.log(
        "LIVE GAP: approval-required shell prompt did not produce a pending approval; controlled approval tests cover policy.",
      );
    record({
      scenario: "wait-approval-attempt",
      threadId: approval,
      state: await state(approval),
      exit: approvalResult.code,
      pendingRequests: approvalEnvelope.pendingRequests,
      liveGap:
        approvalResult.code === 7 ? null : "approval-required prompt produced no pending approval",
    });
  } finally {
    if (process.env["T3C_FOLLOW_EVIDENCE"])
      await NodeFSP.writeFile(
        process.env["T3C_FOLLOW_EVIDENCE"],
        JSON.stringify(evidence, null, 2),
      );
    if (client)
      for (const id of created) {
        await client.threads.stop(threadId(id));
        await client.threads.delete(threadId(id));
      }
    await client?.close();
    await issuer.close();
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});
