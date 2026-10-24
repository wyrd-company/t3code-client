// ---
// relationships:
//   demonstrates: command-line
//   references: testing
// ---
import * as NodeCrypto from "node:crypto";
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { ProfileManager, T3Client } from "@wyrd-company/t3code-lib";
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
process.env.T3_LIVE_EVIDENCE_DIR = `${root}/server-evidence`;
async function verifyOwnedLogs() {
  const secrets = JSON.parse(
    await NodeFSP.readFile(`${root}/secrets.json`, "utf8").catch(() => "[]"),
  );
  const resolved = await new ProfileManager({ configDir: `${root}/config` })
    .resolve()
    .catch(() => undefined);
  if (resolved) secrets.push((await resolved.credentials.load()).accessToken);
  const logPaths = [
    `${root}/commands.jsonl`,
    ...(process.env.T3_LIVE_HOME
      ? [NodePath.join(process.env.T3_LIVE_HOME, "..", "server.log")]
      : []),
  ];
  let scanned = 0;
  for (const path of logPaths) {
    const content = await NodeFSP.readFile(path, "utf8").catch(() => undefined);
    if (content === undefined) continue;
    scanned++;
    if (secrets.some((secret) => secret && content.includes(secret)))
      throw new Error("Owned demo log contains a credential; evidence withheld.");
  }
  console.log(JSON.stringify({ ownedLogScan: { files: scanned, secretMatches: 0 } }));
}

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
    JSON.stringify({
      actualServer: versionResult.data.server,
      packages: {
        cli: versionResult.data.cli,
        library: versionResult.data.library,
        target: versionResult.data.target,
      },
      operationalOverridesCleared: true,
    }),
  );
  const issuer = T3Client.create({
    baseUrl: process.env.T3_LIVE_URL,
    accessToken: process.env.T3_LIVE_TOKEN,
  });
  let credential;
  try {
    credential = (
      await issuer.auth.createPairingCredential({
        label: "demo",
        scopes: ["orchestration:read", "orchestration:operate"],
      })
    ).credential;
  } finally {
    await issuer.close();
  }
  await NodeFSP.writeFile(`${root}/pairing-input`, credential + "\n", { mode: 0o600 });
  await NodeFSP.writeFile(
    `${root}/secrets.json`,
    JSON.stringify([credential, process.env.T3_LIVE_TOKEN]),
    { mode: 0o600 },
  );
  delete process.env.T3_SERVER_URL;
  delete process.env.T3_TOKEN;
  delete process.env.T3_LIVE_TOKEN;
  process.env.DEMO_SERVER = process.env.T3_LIVE_URL;
  process.env.DEMO_PAIRING_INPUT = `${root}/pairing-input`;
  process.env.DEMO_PROJECT = `${root}/sample-project`;
  await NodeFSP.mkdir(process.env.DEMO_PROJECT);
  await NodeFSP.mkdir(`${root}/bin`);
  await NodeFSP.mkdir(new URL("../../../docs/user/t3c/assets/", import.meta.url), {
    recursive: true,
  });
  await NodeFSP.writeFile(
    `${root}/bin/t3c.mjs`,
    `#!/usr/bin/env node
import { captureDemoCommand } from ${JSON.stringify(new URL("./demoCapture.mjs", import.meta.url).href)};
try { await captureDemoCommand(${JSON.stringify(cli)}, ${JSON.stringify(root)}, process.argv.slice(2)); }
catch { process.stderr.write("Demo capture failed.\\n"); process.exitCode = 1; }
`,
    { mode: 0o755 },
  );
  await NodeFSP.symlink("t3c.mjs", `${root}/bin/t3c`);
  console.log(
    JSON.stringify({ demoRoot: root, serverHome: process.env.T3_LIVE_HOME, model: "gpt-6-luna" }),
  );
  if (process.argv.includes("--commands-only")) {
    const commands = [
      [
        "auth",
        "pair",
        "--server",
        process.env.DEMO_SERVER,
        "--pairing-token-stdin",
        "--name",
        "demo",
      ],
      [
        "thread",
        "start",
        "Reply with HELLO only.",
        "--project-path",
        process.env.DEMO_PROJECT,
        "--model",
        "gpt-6-luna",
        "--json",
      ],
    ];
    let id;
    const execute = (args, input) =>
      NodeChildProcess.execFileSync(`${root}/bin/t3c`, args, {
        env: process.env,
        encoding: "utf8",
        ...(input ? { input } : {}),
      });
    for (const args of commands) {
      const output = execute(args, args[0] === "auth" ? credential + "\n" : undefined);
      if (args[1] === "start") id = JSON.parse(output).data.threadId;
    }
    for (const args of [
      ["thread", "wait", id],
      ["run", "Reply with HELLO only.", "--thread", id, "--model", "gpt-6-luna"],
      ["project", "list"],
      ["thread", "list"],
    ])
      execute(args);
  } else {
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
    const artifactPath = process.argv.includes("--check")
      ? `${root}/demo.gif`
      : NodePath.resolve(import.meta.dirname, "../../../docs/user/t3c/assets/demo.gif");
    const artifact = await NodeFSP.readFile(artifactPath);
    console.log(
      JSON.stringify({
        demoArtifact: {
          path: artifactPath,
          size: artifact.length,
          sha256: NodeCrypto.createHash("sha256").update(artifact).digest("hex"),
        },
      }),
    );
  }
  const commands = (await NodeFSP.readFile(`${root}/commands.jsonl`, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const subject = verifyDemoCommands(commands, {
    server: process.env.DEMO_SERVER,
    project: process.env.DEMO_PROJECT,
  });
  console.log(JSON.stringify({ demoCommands: commands, subject }));
} finally {
  try {
    await verifyOwnedLogs();
    const evidence = await NodeFSP.readFile(`${root}/commands.jsonl`, "utf8").catch(() => null);
    console.log(JSON.stringify({ demoCommandEvidence: evidence }));
  } finally {
    try {
      await teardown?.();
      const records = await NodeFSP.readdir(`${root}/server-evidence`).catch(() => []);
      const lifecycle = [];
      for (const file of records.filter((file) => file.endsWith(".json")))
        lifecycle.push(
          JSON.parse(await NodeFSP.readFile(`${root}/server-evidence/${file}`, "utf8")),
        );
      console.log(JSON.stringify({ demoServerLifecycle: lifecycle }));
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
      console.log(JSON.stringify({ demoRoot: root, ownedCleanup: "complete" }));
    }
  }
}
