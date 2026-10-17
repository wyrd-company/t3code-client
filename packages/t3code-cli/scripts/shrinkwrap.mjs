// ---
// relationships:
//   implements: releasing
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";

const directory = NodeURL.fileURLToPath(new URL("..", import.meta.url));
const root = NodePath.resolve(directory, "../..");
const temporary = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-shrinkwrap-"));
try {
  const manifest = JSON.parse(
    await NodeFSP.readFile(NodePath.join(directory, "package.json"), "utf8"),
  );
  const library = JSON.parse(
    await NodeFSP.readFile(NodePath.join(root, "packages/t3code-lib/package.json"), "utf8"),
  );
  const tarball = NodeChildProcess.execFileSync(
    NodePath.join(root, "scripts/release/verify-package.sh"),
    ["t3code-lib", temporary],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  ).trim();
  const dependencies = { ...manifest.dependencies, [library.name]: `file:${tarball}` };
  await NodeFSP.writeFile(
    NodePath.join(temporary, "package.json"),
    JSON.stringify({
      name: manifest.name,
      version: manifest.version,
      dependencies,
      engines: manifest.engines,
      bin: manifest.bin,
    }),
  );
  try {
    const previous = JSON.parse(
      await NodeFSP.readFile(NodePath.join(directory, "npm-shrinkwrap.json"), "utf8"),
    );
    previous.version = manifest.version;
    previous.packages[""] = {
      name: manifest.name,
      version: manifest.version,
      dependencies,
      engines: manifest.engines,
      bin: manifest.bin,
    };
    delete previous.packages[`node_modules/${library.name}`];
    await NodeFSP.writeFile(
      NodePath.join(temporary, "package-lock.json"),
      JSON.stringify(previous),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  NodeChildProcess.execFileSync(
    "npm",
    ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: temporary, stdio: ["ignore", "ignore", "inherit"] },
  );
  const lock = JSON.parse(
    await NodeFSP.readFile(NodePath.join(temporary, "package-lock.json"), "utf8"),
  );
  lock.packages[""].dependencies[library.name] = library.version;
  lock.packages[`node_modules/${library.name}`].resolved =
    `https://registry.npmjs.org/${library.name}/-/t3code-lib-${library.version}.tgz`;
  // npm computes integrity from the exact library tarball; publication uses those bytes.
  await NodeFSP.writeFile(
    NodePath.join(directory, "npm-shrinkwrap.json"),
    `${JSON.stringify(lock, null, 2)}\n`,
  );
} finally {
  await NodeFSP.rm(temporary, { recursive: true, force: true });
}
