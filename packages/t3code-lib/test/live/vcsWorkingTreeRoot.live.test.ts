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

describe.skipIf(!baseUrl || !token)("live working-tree roots", () => {
  it("reports the worktree root and root-relative file paths from a nested cwd", async () => {
    const cwd = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-status-root-"));
    const client = T3Client.create({
      baseUrl: baseUrl ?? "",
      accessToken: token ?? "",
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
    try {
      NodeCP.execFileSync("git", ["init", "--initial-branch=main", cwd], { stdio: "pipe" });
      const nested = NodePath.join(cwd, "nested");
      await NodeFSP.mkdir(nested);
      await NodeFSP.writeFile(NodePath.join(nested, "sample file.txt"), "sample\n");
      NodeCP.execFileSync("git", ["-C", cwd, "add", "nested/sample file.txt"], { stdio: "pipe" });
      NodeCP.execFileSync(
        "git",
        [
          "-C",
          cwd,
          "-c",
          "user.name=Sample",
          "-c",
          "user.email=sample@example.invalid",
          "commit",
          "-m",
          "Initial",
        ],
        { stdio: "pipe" },
      );
      await NodeFSP.appendFile(NodePath.join(nested, "sample file.txt"), "changed\n");
      const status = await client.vcs.status({ cwd: nested });
      expect(status.workingTree.rootPath).toBe(await NodeFSP.realpath(cwd));
      expect(status.workingTree.files.map((file) => file.path)).toContain("nested/sample file.txt");
      const abort = new AbortController();
      let observed = false;
      try {
        for await (const event of client.vcs.watchStatus(
          { cwd: nested },
          { signal: abort.signal },
        )) {
          if (!("_tag" in event) || event._tag !== "snapshot") continue;
          observed = true;
          expect(event.local.workingTree.rootPath).toBe(await NodeFSP.realpath(cwd));
          expect(event.local.workingTree.files.map((file) => file.path)).toContain(
            "nested/sample file.txt",
          );
          break;
        }
        expect(observed).toBe(true);
      } finally {
        abort.abort();
      }
    } finally {
      await client.close();
      await NodeFSP.rm(cwd, { recursive: true, force: true });
    }
  });
});
