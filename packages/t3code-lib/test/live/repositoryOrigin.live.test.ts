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
import { T3Client, type ProjectId } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];

describe.skipIf(!baseUrl || !token)("live repository origin remote URL", () => {
  it("returns a differing checkout remote and omits origin for the canonical remote", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-repository-origin-"));
    const client = T3Client.create({
      baseUrl: baseUrl ?? "",
      accessToken: token ?? "",
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
    const ids: ProjectId[] = [];
    const canonicalUrl = "https://example.invalid/sample/canonical.git";
    const forkUrl = "https://example.invalid/sample/fork.git";
    try {
      for (const [name, remoteUrl] of [
        ["fork", forkUrl],
        ["canonical", canonicalUrl],
      ] as const) {
        const cwd = NodePath.join(root, name);
        await NodeFSP.mkdir(cwd);
        const git = (...args: string[]) =>
          NodeCP.execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
        git("init", "--initial-branch=main");
        git("remote", "add", "origin", remoteUrl);
        git("remote", "add", "upstream", canonicalUrl);
        const created = await client.projects.create({
          workspaceRoot: cwd,
          title: `Sample ${name}`,
        });
        ids.push(created.id);
        // Background enrichment can outlast expect.poll's one-second default on CI.
        await expect
          .poll(
            async () => {
              const snapshot = await client.projects.snapshot();
              return snapshot.projects.find((candidate) => candidate.id === created.id)
                ?.repositoryIdentity?.locator.remoteUrl;
            },
            { timeout: 10_000 },
          )
          .toBe(canonicalUrl);
        const project = (await client.projects.snapshot()).projects.find(
          (candidate) => candidate.id === created.id,
        );
        expect(project?.repositoryIdentity?.locator.remoteUrl).toBe(canonicalUrl);
        if (name === "fork") {
          expect(project?.repositoryIdentity?.origin?.remoteUrl).toBe(forkUrl);
        } else {
          expect(project?.repositoryIdentity?.origin).toBeUndefined();
        }
      }
    } finally {
      try {
        for (const id of ids) await client.projects.delete(id, { force: true });
      } finally {
        await client.close();
        await NodeFSP.rm(root, { recursive: true, force: true });
      }
    }
  });
});
