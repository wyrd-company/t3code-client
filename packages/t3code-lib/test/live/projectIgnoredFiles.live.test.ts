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
import { T3Client, T3RpcError } from "../../src/index.ts";
import type { ProjectListIgnoredFilesResult } from "../../src/schemas/projects.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];

const git = (cwd: string, ...args: string[]) =>
  NodeCP.execFileSync(
    "git",
    ["-C", cwd, "-c", "user.name=Sample", "-c", "user.email=sample@example.invalid", ...args],
    { stdio: "pipe" },
  );

async function write(root: string, relativePath: string, contents: string): Promise<number> {
  await NodeFSP.mkdir(NodePath.dirname(NodePath.join(root, relativePath)), { recursive: true });
  await NodeFSP.writeFile(NodePath.join(root, relativePath), contents);
  return Buffer.byteLength(contents);
}

async function repository(root: string, ignore: string, tracked: readonly string[]) {
  NodeCP.execFileSync("git", ["init", "--initial-branch=main", root], { stdio: "pipe" });
  await write(root, ".gitignore", ignore);
  for (const relativePath of tracked) await write(root, relativePath, "tracked\n");
  git(root, "add", ".gitignore", ...tracked);
  git(root, "commit", "-m", "Initial");
}

describe.skipIf(!baseUrl || !token)("live ignored file listing", () => {
  it("lists ignored files and fails on a missing or non-directory cwd on both typed paths", async () => {
    const roots: string[] = [];
    const temporary = async (prefix: string) => {
      const dir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), prefix));
      roots.push(dir);
      return dir;
    };
    const client = T3Client.create({
      baseUrl: baseUrl ?? "",
      accessToken: token ?? "",
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
    const both = (cwd: string): Array<() => Promise<ProjectListIgnoredFilesResult>> => [
      () => client.rpc.call("projects.listIgnoredFiles", { cwd }),
      () => client.projects.files.listIgnored({ cwd }),
    ];
    try {
      const repo = await temporary("t3code-ignored-sample-");
      await repository(repo, "sample.env\nignored-folder/\n*.log\nsample-link\n", [
        "tracked.txt",
        "nested/keep.txt",
      ]);
      const envBytes = await write(repo, "sample.env", "SAMPLE_KEY=sample-value\n");
      const logBytes = await write(repo, "nested/build.log", "sample log line\nsecond line\n");
      await write(repo, "ignored-folder/inner.txt", "inner\n");
      await write(repo, "untracked.txt", "untracked\n");
      await NodeFSP.symlink("sample.env", NodePath.join(repo, "sample-link"));
      for (const list of both(repo)) {
        expect(await list()).toEqual({
          files: [
            { path: "nested/build.log", byteLength: logBytes },
            { path: "sample.env", byteLength: envBytes },
          ],
          truncated: false,
        });
      }

      const capped = await temporary("t3code-ignored-cap-");
      await repository(capped, "*.tmp\n", []);
      for (let index = 0; index < 201; index += 1) {
        await write(capped, `cap-${String(index).padStart(3, "0")}.tmp`, "x");
      }
      for (const list of both(capped)) {
        const result = await list();
        expect(result.truncated).toBe(true);
        expect(result.files).toHaveLength(200);
      }

      const plain = await temporary("t3code-ignored-plain-");
      await write(plain, "sample.env", "SAMPLE_KEY=sample-value\n");
      for (const list of both(plain)) {
        expect(await list()).toEqual({ files: [], truncated: false });
      }

      const missing = await temporary("t3code-ignored-missing-");
      await NodeFSP.rm(missing, { recursive: true, force: true });
      for (const cwd of [missing, NodePath.join(repo, "tracked.txt")]) {
        for (const list of both(cwd)) {
          const error = await list().catch((caught: unknown) => caught);
          expect(error).toBeInstanceOf(T3RpcError);
          expect(error).toMatchObject({ code: "rpc_failed", tag: "ProjectListEntriesError" });
        }
      }
    } finally {
      await client.close();
      for (const dir of roots) await NodeFSP.rm(dir, { recursive: true, force: true });
    }
  });
});
