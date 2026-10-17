// ---
// relationships:
//   verifies: command-contract
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vite-plus/test";
import {
  ProfileManager,
  T3Client,
  pendingRequests,
  providerInstanceId,
  type ThreadId,
} from "@wyrd-company/t3code-lib";
const execFile = promisify(NodeChildProcess.execFile);

it("inspects projects, server and Luna conversations through the built CLI", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-inspection-"));
  const workspace = NodePath.join(root, "workspace");
  await NodeFSP.mkdir(workspace);
  const issuer = T3Client.create({
    baseUrl: process.env["T3_LIVE_URL"]!,
    accessToken: process.env["T3_LIVE_TOKEN"]!,
  });
  const profiles = new ProfileManager({ configDir: NodePath.join(root, "profile") });
  const subjects: ThreadId[] = [];
  const evidence: Record<string, unknown> = {
    serverHome: process.env["T3_LIVE_HOME"],
    profileHome: profiles.configDir,
  };
  function record(value: Record<string, unknown>) {
    Object.assign(evidence, value);
    console.log(JSON.stringify(value));
  }
  let client: T3Client | undefined;
  let projectId: Awaited<ReturnType<T3Client["projects"]["ensure"]>>["id"] | undefined;
  try {
    const pair = await issuer.auth.createPairingCredential({
      label: "sample-inspection",
      scopes: ["orchestration:read", "orchestration:operate"],
    });
    await profiles.pair({ name: "sample", url: process.env["T3_LIVE_URL"]! }, pair.credential);
    client = T3Client.create(await profiles.resolve({ env: {} }));
    const env = {
      ...process.env,
      T3C_CONFIG_HOME: profiles.configDir,
      T3_SERVER_URL: "",
      T3_TOKEN: "",
    };
    async function cli(args: string[], expectedExit = 0) {
      let stdout: string;
      let code = 0;
      try {
        stdout = (await execFile(process.execPath, ["dist/cli.js", ...args, "--json"], { env }))
          .stdout;
      } catch (error) {
        const failure = error as { stdout: string; code: number };
        stdout = failure.stdout;
        code = failure.code;
      }
      expect(code).toBe(expectedExit);
      expect(stdout.trim().split("\n")).toHaveLength(1);
      const result = JSON.parse(stdout);
      expect(result.exitCode).toBe(expectedExit);
      return result;
    }
    const ensured = await cli(["project", "ensure", workspace]);
    projectId = ensured.data.id;
    expect(ensured.data.workspaceRoot).toBe(workspace);
    expect((await cli(["project", "ensure", workspace])).data.id).toBe(projectId);
    expect((await cli(["project", "list"])).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: projectId })]),
    );
    const info = await cli(["server", "info"]);
    expect(info.data.environment).toMatchObject({ orchestrationProtocolVersion: 2 });
    expect(info.data.providers).toEqual(
      expect.arrayContaining([expect.objectContaining({ instanceId: "codex" })]),
    );
    await cli(["thread", "read", "missing-thread"], 10);
    if (process.env["T3_LIVE_AGENT"] !== "1") return;
    const thread = await client.threads.create({
      projectId: projectId!,
      title: "Sample inspection",
      modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
    });
    subjects.push(thread.id);
    const turn = await client.threads.startTurn({
      threadId: thread.id,
      text: "Reply with SAMPLE only.",
    });
    const outcome = await turn.completion;
    expect(outcome.state).toBe("completed");
    expect((await cli(["thread", "list"])).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: thread.id })]),
    );
    const full = await cli(["thread", "read", thread.id]);
    expect(full.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", text: "Reply with SAMPLE only." }),
        expect.objectContaining({ role: "assistant", text: expect.stringContaining("SAMPLE") }),
      ]),
    );
    expect((await cli(["thread", "read", thread.id, "--full"])).data).toEqual(full.data);
    const last = await cli(["thread", "read", thread.id, "--last"]);
    expect(last.data).toContain("SAMPLE");
    await cli(["thread", "interrupt", thread.id]);
    const unknown = await cli(
      ["thread", "respond", thread.id, "--request", "missing-request", "--accept"],
      1,
    );
    expect(unknown.error).toBeDefined();
    record({
      inspection: {
        threadId: thread.id,
        model: "gpt-6-luna",
        state: outcome.state,
        exits: {
          projectEnsure: 0,
          projectList: 0,
          serverInfo: 0,
          threadList: 0,
          read: 0,
          full: 0,
          last: 0,
          idleInterrupt: 0,
          unknownRequest: 1,
          missingThread: 10,
        },
      },
    });

    const active = await client.threads.startTurn({
      threadId: thread.id,
      text: "Write a very long numbered list of generic colors, at least 500 entries.",
    });
    await cli(["thread", "interrupt", thread.id]);
    const interrupted = await active.completion;
    expect(["interrupted", "cancelled"]).toContain(interrupted.state);
    record({
      inspectionActiveInterrupt: { threadId: thread.id, state: interrupted.state, exit: 0 },
    });

    const approval = await client.threads.create({
      projectId: projectId!,
      title: "Sample approval",
      runtimeMode: "approval-required",
      modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
    });
    subjects.push(approval.id);
    const approvalTurn = await client.threads.startTurn({
      threadId: approval.id,
      text: `Use a shell command to write SAMPLE to ${NodePath.join(root, "approval-proof.txt")}. Request approval if required.`,
    });
    // This is a test observation bound; no command adds a run deadline.
    const observation = new AbortController();
    const timer = setTimeout(() => observation.abort(), 45_000);
    let accepted = false;
    let acceptedRequestId: string | null = null;
    const completion = approvalTurn.completion.catch(() => undefined);
    try {
      for await (const item of client.threads.watch(approval.id, { signal: observation.signal })) {
        if (item.kind === "turn-settled") break;
        const pending =
          item.kind === "approval-requested"
            ? item
            : item.kind === "snapshot"
              ? pendingRequests(item.snapshot.projection).find(
                  (request) => request.kind === "approval",
                )
              : undefined;
        if (pending) {
          await cli(["thread", "respond", approval.id, "--request", pending.requestId, "--accept"]);
          expect(await client.threads.pendingRequests(approval.id)).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ requestId: pending.requestId })]),
          );
          accepted = true;
          acceptedRequestId = pending.requestId;
          break;
        }
      }
    } catch (error) {
      if (!observation.signal.aborted) throw error;
    } finally {
      clearTimeout(timer);
      observation.abort();
      await client.threads.interrupt(approval.id);
      await completion;
    }
    record({
      inspectionApproval: {
        threadId: approval.id,
        accepted,
        requestId: acceptedRequestId,
        exit: accepted ? 0 : null,
        liveGap: accepted
          ? null
          : "approval-required shell prompt produced no observable pending approval",
      },
      oversizedTranscript: "controlled unit fake; live size refusal not induced",
    });
  } finally {
    if (process.env["T3C_INSPECTION_EVIDENCE"])
      await NodeFSP.writeFile(
        process.env["T3C_INSPECTION_EVIDENCE"],
        JSON.stringify(evidence, null, 2),
      );
    if (client) {
      for (const id of subjects) await client.threads.delete(id);
      if (projectId) await client.projects.delete(projectId, { force: true });
    }
    await client?.close();
    await issuer.close();
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});
