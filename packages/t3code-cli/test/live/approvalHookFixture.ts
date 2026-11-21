// ---
// relationships:
//   verifies: request-watch
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";
import { fileURLToPath } from "node:url";
import { providerInstanceId, schemas } from "@wyrd-company/t3code-lib";
import { expect } from "vite-plus/test";
import { waitFor } from "../../../t3code-lib/test/live/liveClient.ts";
import { startScratchServer } from "../../../t3code-lib/test/live/peerServer.ts";

const agent = providerInstanceId("sample-agent");
const stub = fileURLToPath(
  new URL("../../../t3code-lib/test/live/stubAcpAgent.mjs", import.meta.url),
);
const guide = new URL("../../../../docs/user/t3c/watch-approvals.md", import.meta.url);
export function traceLines(stream: NodeJS.ReadableStream) {
  const lines: { text: string; at: number }[] = [];
  NodeReadline.createInterface({ input: stream }).on("line", (text) =>
    lines.push({ text, at: Date.now() }),
  );
  return lines;
}

export async function startApprovalHookFixture(evidence: unknown[]) {
  let home = "";
  let env: NodeJS.ProcessEnv;

  async function cli(args: string[], input?: string): Promise<string> {
    const child = NodeChildProcess.spawn("t3c", args, {
      cwd: home,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const closed = new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    const stdout = traceLines(child.stdout);
    const stderr = traceLines(child.stderr);
    child.stdin.end(input);
    const exit = await closed;
    // Pairing output and input are deliberately omitted from retained evidence.
    const safeOutput = args[0] !== "auth";
    expect(exit, safeOutput ? JSON.stringify({ stdout, stderr }) : "isolated profile pairing").toBe(
      0,
    );
    evidence.push({
      command: ["t3c", ...args],
      exit,
      ...(safeOutput && { stdout: stdout.map(({ text }) => text) }),
    });
    return stdout.map(({ text }) => text).join("\n");
  }

  const peer = await startScratchServer("t3c-approval-hook-guide-", async (root) => {
    home = root;
    await NodeFSP.writeFile(NodePath.join(home, "agent.log"), "");
    const content = await NodeFSP.readFile(guide, "utf8");
    const hook = /^```sh\n(#!\/bin\/sh\n[\s\S]*?)^```$/mu.exec(content)?.[1];
    if (hook === undefined) throw new Error("The guide is missing the hook script.");
    await NodeFSP.writeFile(NodePath.join(home, "forward-to-reviewer.sh"), hook, { mode: 0o700 });
    await NodeFSP.writeFile(
      NodePath.join(home, "t3c"),
      '#!/bin/sh\nexec "$WATCH_EXAMPLE_NODE" "$WATCH_EXAMPLE_CLI" "$@"\n',
      { mode: 0o700 },
    );
    return {};
  });
  try {
    env = {
      PATH: home + NodePath.delimiter + process.env["PATH"],
      T3C_CONFIG_HOME: NodePath.join(home, "profiles"),
      WATCH_EXAMPLE_NODE: process.execPath,
      WATCH_EXAMPLE_CLI: NodePath.resolve("dist/cli.js"),
    };
    const { client } = peer;
    const { credential } = await client.auth.createPairingCredential({
      label: "approval hook guide",
      scopes: ["orchestration:read", "orchestration:operate"],
    });
    await cli(
      ["auth", "pair", "--server", peer.baseUrl, "--name", "sample", "--pairing-token-stdin"],
      credential + "\n",
    );
    await cli(["auth", "switch", "sample"]);
    const version = JSON.parse(await cli(["version", "--json"]));
    expect(version).toMatchObject({
      data: {
        server: { version: "0.1.10", protocol: 2 },
        sources: { server: "profile", credentials: "profile" },
      },
    });
    await client.rpc.call("server.updateSettings", {
      patch: {
        providerInstances: {
          [agent]: {
            driver: schemas.common.ProviderDriverKind.parse("acpRegistry"),
            displayName: "Sample agent",
            config: {
              source: "local",
              commandPath: process.execPath,
              commandArgs: [stub, NodePath.join(home, "agent.log"), "watch-example"],
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
      "the sample agent",
      { timeoutMs: 60_000 },
    );
    async function createProject(title: string) {
      const workspaceRoot = NodePath.join(home, title);
      await NodeFSP.mkdir(workspaceRoot);
      const project = await client.projects.create({ title, workspaceRoot });
      return project.id;
    }
    const workProjectId = await createProject("work");
    const reviewProjectId = await createProject("review");
    env["DEMO_PROJECT_ID"] = workProjectId;
    return { peer, env, home, workProjectId, reviewProjectId, cli, startThread };
  } catch (error) {
    await peer.stop();
    throw error;
  }

  async function startThread(projectId: string, title: string, prompt: string) {
    return schemas.common.ThreadId.parse(
      await cli([
        "thread",
        "start",
        "--project",
        projectId,
        "--title",
        title,
        "--mode",
        "approval-required",
        "--provider",
        agent,
        "--model",
        "default",
        prompt,
      ]),
    );
  }
}
