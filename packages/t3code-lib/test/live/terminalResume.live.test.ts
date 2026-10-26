// ---
// relationships:
//   verifies: library-facades
// ---
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { WebSocket as WsWebSocket } from "ws";
import { describe, expect, it } from "vite-plus/test";
import { T3Client } from "../../src/client.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import type { TerminalAttachInput } from "../../src/schemas/terminal.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];

describe.skipIf(!baseUrl || !token)("live terminal resume", () => {
  it("recovers an unknown ID, preserves a closed terminal and permits an ordinary reopen", async () => {
    const cwd = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-terminal-"));
    const client = T3Client.create({
      baseUrl: baseUrl ?? "",
      accessToken: token ?? "",
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
    const input = { threadId: NodeCrypto.randomUUID(), terminalId: "term-1", cwd };
    const firstEvent = async (options: TerminalAttachInput) => {
      const controller = new AbortController();
      try {
        for await (const event of client.terminal.attach(options, { signal: controller.signal })) {
          return event;
        }
        throw new Error("Terminal attach ended before its first event");
      } finally {
        controller.abort();
      }
    };
    try {
      // An unknown ID with cwd is recoverable even on a resume subscription.
      const recovered = await firstEvent({ ...input, resume: true });
      expect(recovered).toMatchObject({ type: "snapshot", snapshot: { status: "running" } });
      await client.terminal.close(input);
      const resumed = await firstEvent({ ...input, resume: true, restartIfNotRunning: true });
      expect(resumed).toMatchObject({
        type: "closed",
        threadId: input.threadId,
        terminalId: "term-1",
      });
      const reopened = await firstEvent({ ...input, resume: false, restartIfNotRunning: true });
      expect(reopened).toMatchObject({ type: "snapshot", snapshot: { status: "running" } });
    } finally {
      try {
        await client.terminal.close({ ...input, deleteHistory: true });
      } finally {
        await client.close();
        await NodeFSP.rm(cwd, { recursive: true, force: true });
      }
    }
  });
});
