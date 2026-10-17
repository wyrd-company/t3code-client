// ---
// relationships:
//   verifies: command-line
//   references: testing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
// /tmp is intentional: inherited TMPDIR may be inside a Git checkout.
const root = await NodeFSP.mkdtemp("/tmp/t3c-acceptance-");
const env = {
  ...process.env,
  TMPDIR: root,
  T3C_CONFIG_HOME: `${root}/config`,
  T3_LIVE_AGENT: "1",
  T3_LIVE_MODEL: "gpt-6-luna",
  T3C_ACCEPTANCE_EVIDENCE: `${root}/evidence.json`,
};
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
  delete env[key];
console.log(
  JSON.stringify({
    acceptanceRoot: root,
    serverHome: "owned fresh child of acceptanceRoot",
    operationalOverridesCleared: true,
    model: "gpt-6-luna",
  }),
);
try {
  const child = NodeChildProcess.spawn("pnpm", ["run", "test:live"], { env, stdio: "inherit" });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
  process.exitCode = code;
  try {
    console.log(await NodeFSP.readFile(`${root}/evidence.json`, "utf8"));
  } catch (error) {
    if (code === 0) throw error;
  }
} finally {
  await NodeFSP.rm(root, { recursive: true, force: true });
  console.log(JSON.stringify({ acceptanceRoot: root, ownedCleanup: "complete" }));
}
