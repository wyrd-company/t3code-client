// ---
// relationships:
//   verifies: library-facades
// ---
import * as NodeCP from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { WebSocket as WsWebSocket } from "ws";
import { describe, expect, it } from "vite-plus/test";
import { T3Client } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];

describe.skipIf(!baseUrl || !token)("live repository-root detection", () => {
  it("distinguishes repository root from a subdirectory through the public facade", async () => {
    const cwd = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-repository-root-"));
    const client = T3Client.create({
      baseUrl: baseUrl ?? "",
      accessToken: token ?? "",
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
    try {
      NodeCP.execFileSync("git", ["init", "--initial-branch=main", cwd], { stdio: "pipe" });
      const nested = NodePath.join(cwd, "nested");
      await NodeFSP.mkdir(nested);
      expect((await client.vcs.listRefs({ cwd })).isAtRepositoryRoot).toBe(true);
      expect((await client.vcs.listRefs({ cwd: nested })).isAtRepositoryRoot).toBe(false);
    } finally {
      await client.close();
      await NodeFSP.rm(cwd, { recursive: true, force: true });
    }
  });
});
