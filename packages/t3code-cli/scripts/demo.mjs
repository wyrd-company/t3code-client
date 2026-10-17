// ---
// relationships:
//   demonstrates: command-line
//   references: testing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
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
  await NodeFSP.mkdir(`${root}/bin`);
  await NodeFSP.mkdir(new URL("../docs/assets/", import.meta.url), { recursive: true });
  await NodeFSP.writeFile(
    `${root}/bin/t3c`,
    `#!/usr/bin/env node
import * as fs from "node:fs";
process.on("exit", code => fs.appendFileSync(${JSON.stringify(root + "/commands.jsonl")}, JSON.stringify({command:process.argv.slice(2),exitCode:code})+"\\n"));
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
  const child = NodeChildProcess.spawn("vhs", ["demo/demo.tape"], {
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
  if (commands.length !== 3 || commands.some((command) => command.exitCode !== 0))
    throw new Error(`Demo commands failed: ${JSON.stringify(commands)}`);
  console.log(JSON.stringify({ demoCommands: commands }));
} finally {
  await teardown?.();
  await NodeFSP.rm(root, { recursive: true, force: true });
  console.log(JSON.stringify({ demoRoot: root, ownedCleanup: "complete" }));
}
