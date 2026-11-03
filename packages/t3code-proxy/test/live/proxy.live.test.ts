// ---
// relationships:
//   verifies: proxy
// ---
import { mkdtemp, rm } from "node:fs/promises";
import * as NodeNet from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  T3Client,
  providerInstanceId,
  type ProjectId,
  type ThreadId,
} from "@wyrd-company/t3code-lib";
import { expect, it } from "vite-plus/test";
import { startProxy } from "../../src/service.ts";

const upgrade = (port: number) =>
  new Promise<string>((resolve, reject) => {
    const socket = NodeNet.connect(port, "127.0.0.1", () =>
      socket.write(
        `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
      ),
    );
    let answer = "";
    socket.on("data", (chunk) => (answer += chunk.toString()));
    socket.on("close", () => resolve(answer));
    socket.on("error", reject);
  });

const firstLineAndBody = (answer: string) => ({
  status: answer.split("\r\n")[0],
  body: answer.slice(answer.indexOf("\r\n\r\n") + 4),
});

it("stamps a message on a person's endpoint and leaves the direct route clean", async () => {
  const baseUrl = process.env["T3_LIVE_URL"]!;
  const accessToken = process.env["T3_LIVE_TOKEN"]!;
  const direct = T3Client.create({ baseUrl, accessToken });
  const service = await startProxy(
    {
      upstream: new URL(baseUrl),
      host: "127.0.0.1",
      users: [{ name: "Alice", port: 0 }],
    },
    () => undefined,
  );
  const proxyUrl = `http://127.0.0.1:${service.listeners[0]!.port}`;
  const proxied = T3Client.create({ baseUrl: proxyUrl, accessToken });
  const root = await mkdtemp(join(tmpdir(), "t3code-proxy-live-"));
  let threadId: ThreadId | undefined;
  let projectId: ProjectId | undefined;
  try {
    // A client with no protocol parameter reads the server's refusal through the proxy.
    const directRefusal = firstLineAndBody(await upgrade(Number(new URL(baseUrl).port)));
    expect(directRefusal.status).toContain("426");
    expect(directRefusal.body).not.toBe("");
    expect(firstLineAndBody(await upgrade(service.listeners[0]!.port))).toEqual(directRefusal);

    const project = await proxied.projects.ensure({ workspaceRoot: root, title: "Sample" });
    projectId = project.id;
    const thread = await proxied.threads.create({
      projectId: project.id,
      title: "Sample",
      modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
    });
    threadId = thread.id;

    const stored = async () => JSON.stringify(await direct.threads.transcript(thread.id));
    const expected = JSON.stringify("Reply with SAMPLE only.\n\n— Sent by Alice");
    await proxied.threads.startTurn({
      threadId: thread.id,
      text: "Reply with SAMPLE only.",
      delivery: "queue",
    });
    await expect.poll(stored, { timeout: 30_000 }).toContain(expected);

    const clean = JSON.stringify("Reply with DIRECT only.");
    await direct.threads.startTurn({
      threadId: thread.id,
      text: "Reply with DIRECT only.",
      delivery: "queue",
    });
    await expect.poll(stored, { timeout: 30_000 }).toContain(clean);
    await direct.threads.interrupt(thread.id);
  } finally {
    if (threadId) await direct.threads.delete(threadId).catch(() => undefined);
    if (projectId) await direct.projects.delete(projectId, { force: true }).catch(() => undefined);
    await proxied.close();
    await direct.close();
    await service.close();
    await rm(root, { recursive: true, force: true });
  }
});
