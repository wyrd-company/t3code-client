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

describe.skipIf(!baseUrl || !token)("live upstream references", () => {
  it("returns full tracking refs and omits upstream for untracked branches", async () => {
    const cwd = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-upstream-ref-"));
    const client = T3Client.create({
      baseUrl: baseUrl ?? "",
      accessToken: token ?? "",
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
    const git = (...args: string[]) =>
      NodeCP.execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
    try {
      git("init", "--initial-branch=main");
      git(
        "-c",
        "user.name=Sample",
        "-c",
        "user.email=sample@example.invalid",
        "commit",
        "--allow-empty",
        "-m",
        "Initial",
      );
      git("remote", "add", "origin", cwd);
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      git("branch", "--set-upstream-to=origin/main", "main");
      git("branch", "sample");
      const result = await client.vcs.listRefs({ cwd, refKind: "local" });
      expect(result.refs.find((ref) => ref.name === "main")?.upstreamRef).toBe(
        "refs/remotes/origin/main",
      );
      const untracked = result.refs.find((ref) => ref.name === "sample");
      expect(untracked).toBeDefined();
      expect(untracked).not.toHaveProperty("upstreamRef");
    } finally {
      await client.close();
      await NodeFSP.rm(cwd, { recursive: true, force: true });
    }
  });
});
