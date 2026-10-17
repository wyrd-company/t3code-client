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
const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-pack-"));
const run = (script, args) =>
  NodeChildProcess.execFileSync(NodePath.join(root, "scripts/release", script), args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
try {
  const library = run("verify-package.sh", ["t3code-lib", directory]);
  const cli = run("verify-package.sh", ["t3code-cli", directory]);
  process.stdout.write(`${run("verify-consumer.sh", [cli, "t3code-cli", library])}\n`);
} finally {
  await NodeFSP.rm(directory, { recursive: true, force: true });
}
