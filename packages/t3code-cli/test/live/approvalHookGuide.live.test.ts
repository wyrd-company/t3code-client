// ---
// relationships:
//   verifies: request-watch
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import type { ReportedRequest, ThreadId } from "@wyrd-company/t3code-lib";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { hasExited } from "../../../t3code-lib/test/live/globalSetup.ts";
import { waitFor } from "../../../t3code-lib/test/live/liveClient.ts";
import { startApprovalHookFixture, traceLines } from "./approvalHookFixture.ts";

const sampleTime = { timeoutMs: 25_000, intervalMs: 25 };
const heldPrompt = "Request a held approval.";

describe.skipIf(process.platform === "win32")("the worked t3c approval hook", () => {
  const evidence: unknown[] = [];
  let fixture: Awaited<ReturnType<typeof startApprovalHookFixture>>;
  beforeAll(async () => {
    fixture = await startApprovalHookFixture(evidence);
  }, 180_000);
  afterAll(() => fixture?.peer.stop());

  async function pending(id: ThreadId) {
    return waitFor(
      async () => (await fixture.peer.client.threads.pendingRequests(id))[0],
      "pending approval on the server",
      sampleTime,
    );
  }

  it("forwards an approval, runs the command, excludes the reviewer and reports each request once across restart", async () => {
    const { peer, env, home, workProjectId, reviewProjectId, cli, startThread } = fixture;
    const reviewer = await startThread(
      reviewProjectId,
      "Approval reviewer",
      "Reply READY without using tools.",
    );
    expect(await cli(["thread", "wait", reviewer])).toBe("READY");
    env["REVIEWER_THREAD_ID"] = reviewer;

    const startup = await startThread(workProjectId, "Pending at startup", heldPrompt);
    const startupRequest = await pending(startup);
    const args = [
      "requests",
      "watch",
      "--ignore-defaults",
      "--kind",
      "approval",
      "--exclude-thread",
      reviewer,
      "--exec",
      "./forward-to-reviewer.sh",
      "--exec-concurrency",
      "1",
      "--exec-timeout",
      "1m",
      "--log-level",
      "info",
      "--json",
    ];
    evidence.push({ command: ["t3c", ...args] });
    const watcher = NodeChildProcess.spawn("t3c", args, {
      cwd: home,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        watcher.once("error", reject);
        watcher.once("close", (code, signal) => resolve({ code, signal }));
      },
    );
    const stdout = traceLines(watcher.stdout);
    const stderr = traceLines(watcher.stderr);
    const reports = () =>
      stdout
        .map(({ text }) => JSON.parse(text))
        .filter((line): line is ReportedRequest => line.type === "request");
    const status = (message: string) =>
      waitFor(async () => stderr.find(({ text }) => text === message), message, sampleTime);
    const receipt = (requestId: string, threadId: string) =>
      waitFor(
        async () =>
          stderr.find(({ text }) =>
            text.endsWith(`Received approval ${requestId} for thread ${threadId}`),
          ),
        "the guide hook's stdin receipt",
        sampleTime,
      );
    const report = (threadId: ThreadId) =>
      waitFor(
        async () => reports().find((request) => request.thread.id === threadId),
        "the watch report",
        sampleTime,
      );

    try {
      await status("t3c: watching for requests");
      expect((await report(startup)).requestId).toBe(startupRequest.requestId);
      await receipt(startupRequest.requestId, startup);

      const requester = await startThread(
        workProjectId,
        "Sample command",
        "Run the exact command echo sample and report its output.",
      );
      const request = await report(requester);
      expect(request).toMatchObject({
        kind: "approval",
        project: { id: workProjectId, title: "work" },
        request: { kind: "command", status: "pending" },
        item: { prompt: "echo sample" },
      });
      const received = await receipt(request.requestId, requester);
      const hookLatencyMs = received.at - Date.parse(request.request.createdAt);
      expect(hookLatencyMs).toBeGreaterThanOrEqual(0);
      expect(hookLatencyMs).toBeLessThan(5_000);
      await waitFor(
        async () =>
          stderr.find(({ text }) =>
            text.includes(`Response sent: ${requester}\t${request.requestId}`),
          ),
        "the hook approval response",
        sampleTime,
      );
      expect(await cli(["thread", "wait", requester])).toBe("sample");
      const requesterState = await peer.client.threads.projection(requester);
      expect(requesterState.thread.runtimeMode).toBe("approval-required");
      expect(requesterState.runtimeRequests).toContainEqual(
        expect.objectContaining({
          id: request.requestId,
          status: "resolved",
          decision: "accept",
        }),
      );
      const reviewerState = await peer.client.threads.projection(reviewer);
      const forwarded = reviewerState.messages.find(
        (message) => message.role === "user" && message.text.startsWith("Review this approval."),
      );
      const wireLine = stdout.find(
        ({ text }) => (JSON.parse(text) as ReportedRequest).requestId === request.requestId,
      );
      expect(forwarded && JSON.parse(forwarded.text.split("\n").at(-1)!)).toEqual(
        JSON.parse(wireLine!.text),
      );
      expect(
        stderr.some(({ text }) =>
          text.endsWith(`Reviewer replied APPROVE for ${request.requestId}`),
        ),
      ).toBe(true);
      evidence.push({
        hookLatencyMs,
        runtimeMode: "approval-required",
        requestId: request.requestId,
        decision: "accept",
      });

      await peer.client.threads.startTurn({ threadId: reviewer, text: heldPrompt });
      const excluded = await pending(reviewer);
      const beforeRestart = await startThread(workProjectId, "Pending before restart", heldPrompt);
      const beforeRequest = await pending(beforeRestart);
      await receipt(beforeRequest.requestId, beforeRestart);
      expect(reports().map(({ requestId }) => requestId)).not.toContain(excluded.requestId);
      expect((await pending(reviewer)).requestId).toBe(excluded.requestId);

      // Keep this watch invocation alive but disconnected until the resumed server
      // has an approval pending that the CLI has never seen.
      expect(watcher.kill("SIGSTOP")).toBe(true);
      await peer.restart(async () => {
        await expect(fetch(peer.baseUrl, { signal: AbortSignal.timeout(2_000) })).rejects.toThrow();
      });
      const priorRequestStatus = (
        await peer.client.threads.projection(beforeRestart)
      ).runtimeRequests.find(({ id }) => id === beforeRequest.requestId)?.status;
      const afterRestart = await startThread(workProjectId, "Pending before reconnect", heldPrompt);
      const afterRequest = await pending(afterRestart);
      evidence.push({
        event: "restarted server on the same loopback origin",
        priorRequestStatus,
        pendingBeforeReconnect: afterRequest.requestId,
        excluded: excluded.requestId,
      });
      expect(watcher.kill("SIGCONT")).toBe(true);
      await status("t3c: reconnected");
      await receipt(afterRequest.requestId, afterRestart);
    } catch (error) {
      throw new Error(stderr.map(({ text }) => text).join("\n"), { cause: error });
    } finally {
      if (!hasExited(watcher)) {
        watcher.kill("SIGCONT");
        watcher.kill("SIGTERM");
      }
      expect(await closed).toEqual({ code: 4, signal: null });
    }

    const selected = reports();
    expect(selected.map(({ thread: { title } }) => title)).toEqual([
      "Pending at startup",
      "Sample command",
      "Pending before restart",
      "Pending before reconnect",
    ]);
    const ids = selected.map(({ requestId }) => requestId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(stderr.filter(({ text }) => text.includes("Received approval "))).toHaveLength(
      ids.length,
    );
    expect(JSON.parse(stdout.at(-1)!.text)).toMatchObject({
      type: "result",
      data: { reported: 4, hooks: { succeeded: 4, failed: 0, stopped: 0, notRun: 0 } },
      exitCode: 4,
    });
    const filterRecord = ({ text }: { text: string }) =>
      /^(t3c: (watching for requests|reconnected|Operation interrupted\.)|t3c: hook .*: (Received approval|Reviewer replied APPROVE|Response sent))/u.test(
        text,
      );
    evidence.push({
      watcher: {
        reports: selected.map(({ requestId, thread, project, item }) => ({
          requestId,
          thread,
          project,
          command: item?.type === "approval_request" ? item.prompt : null,
        })),
        stderr: stderr.filter(filterRecord).map(({ text }) => text),
        result: JSON.parse(stdout.at(-1)!.text),
      },
    });
    const destination = process.env["T3C_APPROVAL_HOOK_EVIDENCE"];
    if (destination) await NodeFSP.writeFile(destination, JSON.stringify(evidence, null, 2) + "\n");
  });
});
