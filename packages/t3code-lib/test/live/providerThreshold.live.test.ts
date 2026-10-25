// ---
// relationships:
//   verifies: library-wire
// ---
import { it, expect } from "vite-plus/test";
import { T3Client } from "../../src/client.ts";
import { WebSocket } from "ws";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { threadId, providerInstanceId } from "../../src/schemas/common.ts";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
it.skipIf(
  process.env["T3_LIVE_AGENT"] !== "1" ||
    !process.env["T3_LIVE_URL"] ||
    !process.env["T3_LIVE_TOKEN"],
)(
  "observes stock provider-turn threshold omission",
  async () => {
    const client = T3Client.create({
      baseUrl: process.env["T3_LIVE_URL"]!,
      accessToken: process.env["T3_LIVE_TOKEN"]!,
      webSocket: WebSocket as unknown as WebSocketConstructor,
    });
    const id = threadId(NodeCrypto.randomUUID());
    const workspace = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-usage-live-"));
    const project = await client.projects.ensure({
      workspaceRoot: workspace,
      title: "Sample project",
    });
    try {
      await client.threads.ensure({
        threadId: id,
        projectId: project.id,
        title: "Sample thread",
        modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
        runtimeMode: "auto",
      });
      const turn = await client.threads.startTurn({
        threadId: id,
        text: "Reply with exactly HELLO. Do not use tools or inspect files.",
      });
      const outcome = await turn.completion;
      expect(outcome.state).toBe("completed");
      const projection = await client.threads.projection(id);
      const usage = projection.providerTurns.find((t) => t.tokenUsage)?.tokenUsage;
      expect(usage).toBeDefined();
      expect(typeof usage?.usedTokens).toBe("number");
      expect(Object.hasOwn(usage!, "autoCompactThreshold")).toBe(false);
      expect(Object.hasOwn(usage!, "promptCacheExpiresAt")).toBe(false);
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
  },
  180_000,
);
