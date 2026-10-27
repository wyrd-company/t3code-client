// ---
// relationships:
//   implements: releasing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
const root = NodeURL.fileURLToPath(new URL("../../..", import.meta.url));
const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-mcp-pack-"));
const run = (script, args) =>
  NodeChildProcess.execFileSync(NodePath.join(root, "scripts/release", script), args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
try {
  const library = run("verify-package.sh", ["t3code-lib", directory]);
  const mcp = run("verify-package.sh", ["t3code-mcp", directory]);
  process.stdout.write(`${run("verify-consumer.sh", [mcp, "t3code-mcp", library])}\n`);
} finally {
  await NodeFSP.rm(directory, { recursive: true, force: true });
}
