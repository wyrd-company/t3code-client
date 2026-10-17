// ---
// relationships:
//   demonstrates: command-line
//   references: testing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { verifyDemoCommands } from "./demoEvidence.ts";
import setupServer from "../../t3code-lib/test/live/globalSetup.ts";

const root = await NodeFSP.mkdtemp("/tmp/t3c-demo-");
const cli = NodePath.resolve(import.meta.dirname, "../dist/cli.js");
// This development command always owns its server. Ordinary live tests retain overrides.
for (const key of [
  "T3_LIVE_URL",
  "T3_LIVE_TOKEN",
  "T3_LIVE_HOME",
  "T3_LIVE_WORKSPACE",
  "T3_LIVE_KEEP",
  "T3_LIVE_QUEUED",
  "T3_SERVER_URL",
  "T3_TOKEN",
  "T3CODE_HOME",
])
  delete process.env[key];
process.env.TMPDIR = root;
process.env.T3C_CONFIG_HOME = `${root}/config`;
let teardown;
try {
  teardown = await setupServer();
  process.env.T3_SERVER_URL = process.env.T3_LIVE_URL;
  process.env.T3_TOKEN = process.env.T3_LIVE_TOKEN;
  const versionResult = JSON.parse(
    NodeChildProcess.execFileSync(process.execPath, [cli, "version", "--json"], {
      env: process.env,
      encoding: "utf8",
    }),
  );
  const pinned = JSON.parse(
    await NodeFSP.readFile(new URL("../../t3code-lib/package.json", import.meta.url), "utf8"),
  ).devDependencies.t3;
  if (versionResult.data.server?.version !== pinned || versionResult.data.server?.protocol !== 2)
    throw new Error("Demo server does not match the pinned target.");
  console.log(
    JSON.stringify({ actualServer: versionResult.data.server, operationalOverridesCleared: true }),
  );
  await NodeFSP.mkdir(`${root}/bin`);
  await NodeFSP.mkdir(new URL("../docs/assets/", import.meta.url), { recursive: true });
  await NodeFSP.writeFile(
    `${root}/bin/t3c`,
    `#!/usr/bin/env node
import * as fs from "node:fs";
let stdout = "";
let stderr = "";
const writeOut = process.stdout.write.bind(process.stdout);
const writeErr = process.stderr.write.bind(process.stderr);
process.stdout.write = (chunk, ...args) => { stdout += chunk; return writeOut(chunk, ...args); };
process.stderr.write = (chunk, ...args) => { stderr += chunk; return writeErr(chunk, ...args); };
process.on("exit", code => fs.appendFileSync(${JSON.stringify(root + "/commands.jsonl")}, JSON.stringify({command:process.argv.slice(2),exitCode:code,stdout,threadId:stderr.match(/Thread: ([a-f0-9-]+)/i)?.[1]})+String.fromCharCode(10)));
await import(${JSON.stringify(cli)});
`,
    { mode: 0o755 },
  );
  // .mjs makes the executable shim ESM on Node 22 as well as newer Node.
  await NodeFSP.rename(`${root}/bin/t3c`, `${root}/bin/t3c.mjs`);
  await NodeFSP.symlink("t3c.mjs", `${root}/bin/t3c`);
  console.log(
    JSON.stringify({ demoRoot: root, serverHome: process.env.T3_LIVE_HOME, model: "gpt-6-luna" }),
  );
  const outputs = process.argv.includes("--check") ? ["--output", `${root}/demo.gif`] : [];
  const child = NodeChildProcess.spawn("vhs", ["demo/demo.tape", ...outputs], {
    cwd: NodePath.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      PATH: `${root}/bin:${process.env.PATH}`,
      DISPLAY: "",
      WAYLAND_DISPLAY: "",
    },
    stdio: "inherit",
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
  if (code !== 0) throw new Error(`VHS failed (${code}).`);
  const commands = (await NodeFSP.readFile(`${root}/commands.jsonl`, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const subject = verifyDemoCommands(commands);
  console.log(JSON.stringify({ demoCommands: commands, subject }));
} finally {
  try {
    const evidence = await NodeFSP.readFile(`${root}/commands.jsonl`, "utf8").catch(() => null);
    console.log(JSON.stringify({ demoCommandEvidence: evidence }));
  } finally {
    try {
      await teardown?.();
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
      console.log(JSON.stringify({ demoRoot: root, ownedCleanup: "complete" }));
    }
  }
}
