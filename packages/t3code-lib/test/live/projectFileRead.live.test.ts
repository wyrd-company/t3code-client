// ---
// relationships:
//   verifies: library-facades
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { WebSocket as WsWebSocket } from "ws";
import { describe, expect, it } from "vite-plus/test";
import { T3Client, T3RpcError } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];

describe.skipIf(!baseUrl || !token)("live optional project file reads", () => {
  it("reads existing and absent optional files and retains required-file errors", async () => {
    const cwd = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-file-read-"));
    const client = T3Client.create({
      baseUrl: baseUrl ?? "",
      accessToken: token ?? "",
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
    try {
      await NodeFSP.writeFile(NodePath.join(cwd, "present.txt"), "sample");
      const present = await client.projects.files.read({
        cwd,
        relativePath: "present.txt",
        allowMissing: true,
      });
      expect(present).toMatchObject({
        relativePath: "present.txt",
        contents: "sample",
        byteLength: 6,
        truncated: false,
      });
      expect(present.exists).not.toBe(false);
      expect(
        await client.projects.files.read({ cwd, relativePath: "absent.txt", allowMissing: true }),
      ).toEqual({
        relativePath: "absent.txt",
        contents: "",
        byteLength: 0,
        truncated: false,
        exists: false,
      });
      for (const payload of [
        { cwd, relativePath: "absent.txt" },
        { cwd, relativePath: "absent.txt", allowMissing: false },
      ]) {
        await expect(client.projects.files.read(payload)).rejects.toBeInstanceOf(T3RpcError);
      }
    } finally {
      await client.close();
      await NodeFSP.rm(cwd, { recursive: true, force: true });
    }
  });
});
