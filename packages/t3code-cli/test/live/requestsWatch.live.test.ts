// ---
// relationships:
//   verifies: request-watch
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";
import {
  ProfileManager,
  schemas,
  providerInstanceId,
  type ReportedRequest,
} from "@wyrd-company/t3code-lib";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { hasLiveServer, waitFor } from "../../../t3code-lib/test/live/liveClient.ts";
import { startScratchServer, type PeerServer } from "../../../t3code-lib/test/live/peerServer.ts";

const stubAgent = new URL("../../../t3code-lib/test/live/stubAcpAgent.mjs", import.meta.url)
  .pathname;
const agent = providerInstanceId("sample-agent");
const sampleTime = { timeoutMs: 25_000, intervalMs: 25 };
const shellArgument = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";

describe.skipIf(!hasLiveServer || process.platform === "win32")("built CLI request watch", () => {
  let peer: PeerServer;
  let home: string;
  let profiles: ProfileManager;
  const threads: Parameters<PeerServer["client"]["threads"]["stop"]>[0][] = [];

  beforeAll(async () => {
    peer = await startScratchServer("t3c-requests-watch-", async (root) => {
      home = root;
      await NodeFSP.writeFile(NodePath.join(root, "agent.log"), "");
      return {};
    });
    const { client } = peer;
    await client.rpc.call("server.updateSettings", {
      patch: {
        providerInstances: {
          [agent]: {
            driver: schemas.common.ProviderDriverKind.parse("acpRegistry"),
            displayName: "Sample agent",
            config: {
              source: "local",
              commandPath: process.execPath,
              commandArgs: [stubAgent, NodePath.join(home, "agent.log")],
            },
          },
        },
      },
    });
    await waitFor(
      async () =>
        (await client.server.getConfig()).providers.find(
          (provider) => provider.instanceId === agent && provider.status === "ready",
        ),
      "the stub agent's probe",
      { timeoutMs: 60_000 },
    );

    profiles = new ProfileManager({ configDir: NodePath.join(home, "profiles") });
    const { credential } = await client.auth.createPairingCredential({
      label: "request watch",
      scopes: ["orchestration:read"],
    });
    await profiles.pair({ name: "first", url: peer.baseUrl }, credential);
    await NodeFSP.writeFile(
      NodePath.join(profiles.configDir, "config.json"),
      JSON.stringify({
        current: "first",
        servers: {
          first: { url: peer.baseUrl },
          second: { url: "http://127.0.0.1:1" },
        },
      }),
    );
    await NodeFSP.writeFile(
      NodePath.join(home, "hook.mjs"),
      `import { existsSync, readFileSync } from "node:fs"
const input = readFileSync(0).toString("base64")
console.log(JSON.stringify({ input, origin: process.env.T3_SERVER_URL, pid: process.pid }))
while (!existsSync(process.argv[2])) await new Promise(resolve => setTimeout(resolve, 25))
`,
    );
  }, 180_000);

  afterAll(() => peer?.stop());

  async function requestApproval(projectId: schemas.common.ProjectId, title: string, tag: string) {
    const { client } = peer;
    const thread = await client.threads.create({
      projectId,
      title,
      runtimeMode: "approval-required",
      interactionMode: "default",
      modelSelection: { instanceId: agent, model: "sample-model" },
    });
    threads.push(thread.id);
    await client.threads.setTag(thread.id, tag, true);
    await client.threads.startTurn({ threadId: thread.id, text: "Run the sample command." });
    return thread;
  }

  it.each([false, true])(
    "streams reports and handles both signal paths (force %s)",
    async (force) => {
      await profiles.switch("first");
      const workspaceRoot = NodePath.join(home, `project-${force}`);
      await NodeFSP.mkdir(workspaceRoot);
      const project = await peer.client.projects.create({ title: "Sample project", workspaceRoot });
      const gate = NodePath.join(home, `gate-${force}`);
      const hook = [
        "exec",
        ...[process.execPath, NodePath.join(home, "hook.mjs"), gate].map(shellArgument),
      ].join(" ");
      const child = NodeChildProcess.spawn(
        process.execPath,
        [
          "dist/cli.js",
          "requests",
          "watch",
          "--json",
          "--log-level",
          "info",
          "--kind",
          "approval",
          "--project",
          project.id,
          "--exclude-tag",
          "reviewer",
          "--exec",
          hook,
          "--exec-concurrency",
          "1",
          "--exec-timeout",
          "45s",
        ],
        {
          env: {
            ...process.env,
            T3C_CONFIG_HOME: profiles.configDir,
            T3_SERVER_URL: "",
            T3_TOKEN: "",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      const closed = new Promise<{ code: number | null; signal: string | null }>(
        (resolve, reject) => {
          child.once("error", reject);
          child.once("close", (code, signal) => resolve({ code, signal }));
        },
      );
      const stdout: { line: string; time: number }[] = [];
      const stderr: string[] = [];
      NodeReadline.createInterface({ input: child.stdout }).on("line", (line: string) =>
        stdout.push({ line, time: Date.now() }),
      );
      NodeReadline.createInterface({ input: child.stderr }).on("line", (line: string) =>
        stderr.push(line),
      );
      const hookLines = () =>
        stderr.flatMap((line) => {
          const match = /^t3c: hook "[^"]+": (\{.*\})$/u.exec(line);
          return match
            ? [JSON.parse(match[1]!) as { input: string; origin: string; pid: number }]
            : [];
        });
      try {
        await waitFor(
          async () => stderr.find((line) => line === "t3c: watching for requests"),
          "CLI readiness",
          sampleTime,
        );
        // Change the current profile after readiness but before the first hook.
        await profiles.switch("second");
        const first = await requestApproval(project.id, "Sample thread one", "sample");
        const firstLine = await waitFor(async () => stdout[0], "first request line", sampleTime);
        const firstReport = JSON.parse(firstLine.line) as ReportedRequest & { type: string };
        expect(firstReport).toMatchObject({
          type: "request",
          kind: "approval",
          thread: { id: first.id, title: "Sample thread one", tags: ["sample"] },
          project: { id: project.id, title: "Sample project" },
          request: { status: "pending" },
        });
        expect(firstLine.time - Date.parse(firstReport.request.createdAt)).toBeLessThan(5_000);
        await requestApproval(project.id, "Reviewer", "reviewer");
        const second = await requestApproval(project.id, "Sample thread two", "sample");
        const secondLine = await waitFor(async () => stdout[1], "second request line", sampleTime);
        const secondReport = JSON.parse(secondLine.line) as ReportedRequest;
        expect(secondReport.thread.id).toBe(second.id);
        const firstHook = await waitFor(async () => hookLines()[0], "first hook stdin", sampleTime);
        expect(firstHook.origin).toBe(new URL(peer.baseUrl).origin);
        expect(Buffer.from(firstHook.input, "base64").toString()).toBe(firstLine.line + "\n");
        expect(hookLines()).toHaveLength(1);

        expect(child.kill("SIGTERM")).toBe(true);
        if (force) {
          expect(child.kill("SIGINT")).toBe(true);
        } else {
          // The first hook is still gated, and the reported second request is queued.
          await NodeFSP.writeFile(gate, "");
        }
        expect(await closed).toEqual({ code: 4, signal: null });
        expect(stdout).toHaveLength(3);
        expect(JSON.parse(stdout[2]!.line)).toEqual({
          type: "result",
          data: {
            reported: 2,
            hooks: force
              ? { succeeded: 0, failed: 0, stopped: 1, notRun: 1 }
              : { succeeded: 2, failed: 0, stopped: 0, notRun: 0 },
          },
          exitCode: 4,
          error: { code: "interrupted", message: "Operation interrupted." },
        });
        expect(stderr.at(-1)).toBe("t3c: Operation interrupted.");
        if (force) {
          expect(hookLines()).toHaveLength(1);
          expect(stderr).toContain(
            `t3c: hook stopped for request ${JSON.stringify(firstReport.requestId)} in thread ${JSON.stringify(first.id)}`,
          );
          expect(stderr).toContain(
            `t3c: hook not run for request ${JSON.stringify(secondReport.requestId)} in thread ${JSON.stringify(second.id)}`,
          );
          await waitFor(
            async () => {
              try {
                process.kill(firstHook.pid, 0);
                // Some init processes leave killed orphaned hooks as zombies.
                if (process.platform === "linux") {
                  const stat = await NodeFSP.readFile(`/proc/${firstHook.pid}/stat`, "utf8");
                  if (stat.slice(stat.lastIndexOf(")") + 2).startsWith("Z ")) return true;
                }
              } catch (error) {
                if (["ESRCH", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? ""))
                  return true;
                throw error;
              }
              return undefined;
            },
            "the stopped hook process",
            sampleTime,
          );
        } else {
          expect(hookLines()).toHaveLength(2);
          expect(Buffer.from(hookLines()[1]!.input, "base64").toString()).toBe(
            secondLine.line + "\n",
          );
        }
      } finally {
        await NodeFSP.writeFile(gate, "");
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
        await closed;
        for (const id of threads.splice(0)) await peer.client.threads.stop(id);
      }
    },
  );
});
