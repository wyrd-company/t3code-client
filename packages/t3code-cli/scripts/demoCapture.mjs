// ---
// relationships:
//   verifies: command-line
//   references: profiles
// ---
import * as NodeCrypto from "node:crypto";
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import { ProfileManager, T3Client, threadId } from "@wyrd-company/t3code-lib";

import { sanitizeDemoOutput } from "./demoSafety.ts";

export async function captureDemoCommand(cli, root, args) {
  if (process.env.T3C_CONFIG_HOME !== `${root}/config`)
    throw new Error("Demo profile home differs.");
  // Only the committed tape's non-secret input forms may enter capture evidence.
  const allowed = ["auth", "thread", "run", "project"];
  if (
    !allowed.includes(args[0]) ||
    args.some((arg) => /token=|bearer|--credentials|--pairing-token$|--token-stdin/iu.test(arg))
  )
    throw new Error("Unsafe demo invocation.");
  const secrets = JSON.parse(await NodeFSP.readFile(`${root}/secrets.json`, "utf8"));
  const result = await new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(process.execPath, [cli, ...args], {
      stdio: ["inherit", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", () => reject(new Error("Demo CLI failed to start.")));
    child.once("exit", (code, signal) =>
      resolve({ stdout, stderr, exitCode: signal ? 1 : (code ?? 1) }),
    );
  });
  const profiles = new ProfileManager();
  const resolved = await profiles.resolve();
  // This is the newly paired owned demo profile, never the user's credential home.
  secrets.push((await resolved.credentials.load()).accessToken);
  const client = T3Client.create(resolved);
  try {
    const session = await client.auth.sessionState();
    const profile = {
      name: resolved.profile?.name,
      url: resolved.baseUrl,
      ...resolved.sources,
      authenticated: session.authenticated,
    };
    const stdout = sanitizeDemoOutput(result.stdout, secrets);
    const stderr = sanitizeDemoOutput(result.stderr, secrets);
    let subject;
    const id =
      args[0] === "thread" && args[1] === "start"
        ? JSON.parse(stdout).data.threadId
        : args[0] === "thread" && args[1] === "wait"
          ? args[2]
          : args[0] === "run"
            ? args[args.indexOf("--thread") + 1]
            : undefined;
    if (id && result.exitCode === 0) {
      const projection = await client.threads.projection(threadId(id));
      const run = projection.runs.reduce(
        (latest, candidate) => (!latest || candidate.ordinal > latest.ordinal ? candidate : latest),
        undefined,
      );
      const project = await client.projects.get(projection.thread.projectId);
      subject = {
        threadId: projection.thread.id,
        runId: run?.id,
        projectId: projection.thread.projectId,
        workspaceRoot: project?.workspaceRoot,
        model: projection.thread.modelSelection.model,
        state: run?.status,
      };
    }
    await NodeFSP.appendFile(
      `${root}/commands.jsonl`,
      JSON.stringify({
        commandId: NodeCrypto.randomUUID(),
        command: args,
        exitCode: result.exitCode,
        stdout,
        stderr,
        profile,
        ...(subject ? { subject } : {}),
      }) + "\n",
    );
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    process.exitCode = result.exitCode;
  } finally {
    await client.close();
  }
}
