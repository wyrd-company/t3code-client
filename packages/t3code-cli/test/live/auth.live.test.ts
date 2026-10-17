// ---
// relationships:
//   verifies: command-line
//   references: testing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { ProfileManager, T3Client, providerInstanceId } from "@wyrd-company/t3code-lib";

it("pairs all auth input forms, probes exact profiles, switches, logs out and runs Luna with CLI credentials", async () => {
  const home = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-auth-profile-"));
  const url = process.env["T3_LIVE_URL"]!;
  const issuer = T3Client.create({ baseUrl: url, accessToken: process.env["T3_LIVE_TOKEN"]! });
  const profiles = new ProfileManager({ configDir: home });
  const env = { ...process.env, T3C_CONFIG_HOME: home, T3_SERVER_URL: " ", T3_TOKEN: "" };
  const invocations: { args: string[]; exitCode: number | null; stdout: string; stderr: string }[] =
    [];
  function cli(args: string[], input?: string) {
    const result = NodeChildProcess.spawnSync(
      process.execPath,
      ["dist/cli.js", ...args, "--json"],
      { env, encoding: "utf8", ...(input === undefined ? {} : { input }) },
    );
    // Evidence excludes link/token arguments and all credential input.
    invocations.push({
      args: args.map((value, index) =>
        value.includes("token=") || args[index - 1] === "--pairing-token" ? "[redacted]" : value,
      ),
      exitCode: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    if (result.error) throw result.error;
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    return { code: result.status, result: JSON.parse(result.stdout) };
  }
  async function pairing() {
    return (
      await issuer.auth.createPairingCredential({
        label: "sample-cli-auth",
        scopes: ["orchestration:read", "orchestration:operate"],
      })
    ).credential;
  }
  let client: T3Client | undefined;
  const evidence: Record<string, unknown> = {
    serverHome: process.env["T3_LIVE_HOME"] ?? "caller-owned",
    profileHome: home,
    model: "gpt-6-luna",
  };
  try {
    expect(
      cli([
        "auth",
        "pair",
        `${url}/pair#token=${encodeURIComponent(await pairing())}`,
        "--name",
        "first",
      ]).code,
    ).toBe(0);
    expect(
      cli([
        "auth",
        "pair",
        `${url}/?token=${encodeURIComponent(await pairing())}`,
        "--name",
        "second",
      ]).code,
    ).toBe(0);
    const split = await pairing();
    // Keep the explicit token only in the subprocess invocation, never evidence.
    const result = NodeChildProcess.spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "auth",
        "pair",
        "--server",
        url,
        "--pairing-token",
        split,
        "--name",
        "split",
        "--json",
      ],
      { env, encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    invocations.push({
      args: ["auth", "pair", "--server", url, "--pairing-token", "[redacted]", "--name", "split"],
      exitCode: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    expect(
      cli(
        ["auth", "pair", "--server", url, "--pairing-token-stdin", "--name", "stdin"],
        `${await pairing()}\n`,
      ).code,
    ).toBe(0);
    expect(
      cli(
        ["auth", "pair", "--server", url, "--token-stdin", "--name", "session"],
        `${process.env["T3_LIVE_TOKEN"]!}\n`,
      ).code,
    ).toBe(0);
    expect((await profiles.getCurrent())?.name).toBe("first");
    const status = cli(["auth", "status"]);
    expect(status.code).toBe(0);
    expect(status.result.data.profiles).toHaveLength(5);
    expect(
      status.result.data.profiles.every(
        (p: { authenticated: boolean; reachable: boolean }) => p.authenticated && p.reachable,
      ),
    ).toBe(true);
    expect(status.result.data.effective.sources).toEqual({
      server: "profile",
      credentials: "profile",
    });
    for (const file of await NodeFSP.readdir(NodePath.join(home, "credentials")))
      expect((await NodeFSP.stat(NodePath.join(home, "credentials", file))).mode & 0o777).toBe(
        0o600,
      );
    expect(cli(["auth", "switch", "second"]).code).toBe(0);
    expect((await profiles.getCurrent())?.name).toBe("second");
    expect(cli(["auth", "switch", "missing"]).code).toBe(2);
    expect(cli(["auth", "logout", "missing"]).code).toBe(2);
    expect(
      cli(
        ["auth", "pair", "--server", url, "--token-stdin", "--name", "invalid"],
        "sample-invalid-token\n",
      ).code,
    ).toBe(9);
    expect((await profiles.list()).some((p) => p.name === "invalid")).toBe(false);
    expect(cli(["auth", "status", "--server", "http://127.0.0.1:1"]).code).toBe(8);
    if (process.env["T3_LIVE_AGENT"] === "1") {
      client = T3Client.create(await profiles.resolveProfile("second"));
      const { projectId } = await client.projects.ensureScratch();
      const thread = await client.threads.create({
        projectId,
        title: "Sample auth check",
        modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
      });
      try {
        const turn = await client.threads.startTurn({
          threadId: thread.id,
          text: "Reply with SAMPLE only.",
        });
        const outcome = await turn.completion;
        expect(outcome.state).toBe("completed");
        expect(outcome.assistantMessage?.text).toContain("SAMPLE");
        evidence["subject"] = { threadId: thread.id, model: "gpt-6-luna", state: outcome.state };
      } finally {
        await client.threads.delete(thread.id);
      }
    }
    // Forget second's saved credential through AuthClient; status must fail on current.
    const selected = T3Client.create(await profiles.resolveProfile("second"));
    try {
      await selected.auth.clearCredentials();
    } finally {
      await selected.close();
    }
    const failed = cli(["auth", "status"]);
    expect(failed.code).toBe(9);
    expect(failed.result.data.profiles).toHaveLength(5);
    expect(cli(["auth", "logout"]).code).toBe(0);
    expect(await profiles.getCurrent()).toBeUndefined();
    expect(cli(["auth", "status"]).code).toBe(0);
    for (const name of ["first", "split", "stdin", "session"])
      expect(cli(["auth", "logout", name]).code).toBe(0);
    expect(await profiles.list()).toEqual([]);
    evidence["invocations"] = invocations;
    evidence["acceptanceCompleted"] = true;
    console.log(JSON.stringify({ authAcceptance: evidence }));
  } finally {
    await client?.close();
    await issuer.close();
    await NodeFSP.rm(home, { recursive: true, force: true });
    evidence["ownedCleanup"] = "complete";
    if (process.env["T3C_AUTH_EVIDENCE"])
      await NodeFSP.writeFile(process.env["T3C_AUTH_EVIDENCE"], JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ authProfileHome: home, ownedCleanup: "complete" }));
  }
});
