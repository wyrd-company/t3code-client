// ---
// relationships:
//   verifies: mcp
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { expect, it } from "vite-plus/test";

const SAMPLE_THREAD = "sample-local-server-thread";
const OTHER_THREAD = "sample-other-thread";

type Listed = { port: number; pid: number | null; agent: { threadId: string } | null };

/** A detached HTTP listener with its own process group, attributed to `threadId` when given. */
async function startListener(script: string, threadId?: string) {
  const env: Record<string, string> = { PATH: process.env["PATH"] ?? "" };
  if (threadId !== undefined) env["T3CODE_THREAD_ID"] = threadId;
  const child = NodeChildProcess.spawn(process.execPath, [script], {
    detached: true,
    stdio: ["ignore", "pipe", "ignore"],
    env,
  });
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const port = await new Promise<number>((resolve, reject) => {
    child.stdout.once("data", (chunk: Buffer) => resolve(Number(chunk.toString().trim())));
    child.once("error", reject);
  });
  return { child, pid: child.pid as number, port, exited };
}

it("lists local servers and stops only the one the thread's agent started", async () => {
  const baseUrl = process.env["T3_LIVE_URL"]!;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/cli.js", "serve", "--server", baseUrl],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
      T3_TOKEN: process.env["T3_LIVE_TOKEN"]!,
    },
    stderr: "pipe",
  });
  const mcp = new Client({ name: "sample-live-client", version: "1.0.0" });
  const home = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-mcp-local-"));
  const script = NodePath.join(home, "listener.mjs");
  await NodeFSP.writeFile(
    script,
    `import * as http from "node:http";
const server = http.createServer((_, response) => { response.setHeader("content-type", "text/html"); response.end("<title>sample</title>"); });
server.listen(0, "127.0.0.1", () => process.stdout.write(String(server.address().port) + "\\n"));\n`,
  );
  const owned = await startListener(script, SAMPLE_THREAD);
  const unowned = await startListener(script);
  try {
    await mcp.connect(transport);
    let servers: Listed[] = [];
    // A listener that started just now can miss the first scan.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await mcp.callTool({
        name: "local_servers",
        arguments: { threadId: SAMPLE_THREAD },
      });
      expect(result.isError).toBeFalsy();
      servers = (result.structuredContent as { servers: Listed[] }).servers;
      if (servers.some((row) => row.pid === owned.pid)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    // Only the owned listener: the filter drops the unattributed one and other listeners.
    expect(servers).toEqual([
      expect.objectContaining({
        port: owned.port,
        pid: owned.pid,
        agent: { threadId: SAMPLE_THREAD },
      }),
    ]);

    // An unattributed listener appears only as a probed URL, with no owner.
    const unownedUrl = `http://127.0.0.1:${unowned.port}/`;
    const probed = await mcp.callTool({ name: "local_servers", arguments: { urls: [unownedUrl] } });
    expect((probed.structuredContent as { servers: Listed[] }).servers).toContainEqual(
      expect.objectContaining({ port: unowned.port, agent: null, terminal: null }),
    );

    const refusals = [
      [{ threadId: OTHER_THREAD, pid: owned.pid, port: owned.port }, "not_owned"],
      [{ threadId: SAMPLE_THREAD, pid: unowned.pid, port: unowned.port }, "not_found"],
    ] as const;
    for (const [args, code] of refusals) {
      const refused = await mcp.callTool({ name: "stop_local_server", arguments: args });
      expect(refused).toMatchObject({ isError: true, structuredContent: { error: { code } } });
    }
    expect(unowned.child.exitCode).toBeNull();

    const stopped = await mcp.callTool({
      name: "stop_local_server",
      arguments: { threadId: SAMPLE_THREAD, pid: owned.pid, port: owned.port },
    });
    expect(stopped.structuredContent).toEqual({
      threadId: SAMPLE_THREAD,
      pid: owned.pid,
      port: owned.port,
      stopped: true,
    });
    await owned.exited;
    expect(unowned.child.exitCode).toBeNull();
  } finally {
    await mcp.close();
    // Only the processes that this test started.
    for (const { child } of [owned, unowned])
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await NodeFSP.rm(home, { recursive: true, force: true });
  }
});
