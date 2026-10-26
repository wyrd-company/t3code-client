// ---
// relationships:
//   verifies: library
// ---
import { it, expect } from "vite-plus/test";
import { T3Client } from "../../src/client.ts";
import { WebSocket } from "ws";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { threadId } from "../../src/schemas/common.ts";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
it.skipIf(
  process.env["T3_LIVE_AGENT"] !== "1" ||
    !process.env["T3_LIVE_URL"] ||
    !process.env["T3_LIVE_TOKEN"],
)("observes stock pending request blocking through the public shell", async () => {
  const client = T3Client.create({
    baseUrl: process.env["T3_LIVE_URL"]!,
    accessToken: process.env["T3_LIVE_TOKEN"]!,
    webSocket: WebSocket as unknown as WebSocketConstructor,
  });
  const id = threadId(NodeCrypto.randomUUID());
  const workspace = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-request-live-"));
  const project = await client.projects.ensure({
    workspaceRoot: workspace,
    title: "Sample project",
  });
  try {
    await client.threads.ensure({
      threadId: id,
      projectId: project.id,
      title: "Sample thread",
      modelSelection: { instanceId: "codex" as never, model: "gpt-6-luna" },
      runtimeMode: "auto",
      interactionMode: "plan",
    });
    await client.threads.startTurn({
      threadId: id,
      text: "Use request_user_input now to ask me to choose between blue and green for a sample banner. Do not inspect files or use other tools. Wait for my answer.",
      interactionMode: "plan",
    });
    let summary: unknown;
    for await (const item of client.shell.watch({ signal: AbortSignal.timeout(180_000) })) {
      const shell =
        item.kind === "snapshot"
          ? item.snapshot.threads.find((t) => t.id === id)
          : item.kind === "thread.updated" && item.thread.id === id
            ? item.thread
            : undefined;
      if (shell?.pendingRuntimeRequest) {
        summary = shell.pendingRuntimeRequest;
        break;
      }
    }
    expect(summary).toBeDefined();
    expect(summary).toMatchObject({ blocking: true });
  } finally {
    try {
      await client.threads.stop(id);
      await client.threads.delete(id);
      await client.projects.delete(project.id, { force: true });
    } finally {
      await client.close();
      await NodeFSP.rm(workspace, { recursive: true, force: true });
    }
  }
});
