// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { promisify } from "node:util";
import { T3Client, providerInstanceId } from "@wyrd-company/t3code-lib";
import { expect, it } from "vite-plus/test";

const execFile = promisify(NodeChildProcess.execFile);
it("acknowledges idle Stop and empty Resume and rejects invalid selected Start without agent work", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-controls-"));
  const client = T3Client.create({
    baseUrl: process.env["T3_LIVE_URL"]!,
    accessToken: process.env["T3_LIVE_TOKEN"]!,
  });
  let project: Awaited<ReturnType<typeof client.projects.ensure>> | undefined;
  let thread: Awaited<ReturnType<typeof client.threads.create>> | undefined;
  const env = {
    ...process.env,
    T3C_CONFIG_HOME: NodePath.join(root, "profiles"),
    T3_SERVER_URL: process.env["T3_LIVE_URL"]!,
    T3_TOKEN: process.env["T3_LIVE_TOKEN"]!,
  };
  async function cli(args: string[], exit = 0) {
    let stdout: string,
      code = 0;
    try {
      stdout = (await execFile(process.execPath, ["dist/cli.js", ...args, "--json"], { env }))
        .stdout;
    } catch (error) {
      const failure = error as { stdout: string; code: number };
      stdout = failure.stdout;
      code = failure.code;
    }
    expect(code).toBe(exit);
    const result = JSON.parse(stdout);
    expect(result.exitCode).toBe(exit);
    return result;
  }
  try {
    project = await client.projects.ensure({ workspaceRoot: root, title: "Sample controls" });
    thread = await client.threads.create({
      projectId: project.id,
      title: "Sample controls",
      modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
    });
    expect((await cli(["thread", "stop", thread.id, "--reason", " padded "])).data).toEqual({
      threadId: thread.id,
    });
    expect((await cli(["thread", "queue", "resume", thread.id])).data).toEqual({
      threadId: thread.id,
    });
    expect(
      (await cli(["thread", "queue", "start", thread.id, "sample-absent-run"], 1)).error.code,
    ).toBe("rpc_failed");
    const projection = await client.threads.projection(thread.id);
    expect(projection.runs).toEqual([]);
    expect(projection.providerThreads).toEqual([]);
    expect(projection.messages).toEqual([]);
    expect((await client.threads.get(thread.id))?.status).toBe("idle");
  } finally {
    try {
      if (thread) await client.threads.delete(thread.id);
      if (project) await client.projects.delete(project.id, { force: true });
    } finally {
      await client.close();
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  }
});
