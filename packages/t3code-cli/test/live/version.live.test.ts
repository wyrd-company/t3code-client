// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { ProfileManager, T3Client, providerInstanceId } from "@wyrd-company/t3code-lib";

it("pairs the CLI, reports the real server and completes a Luna subject through the library", async () => {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-version-profile-"));
  const url = process.env["T3_LIVE_URL"]!;
  const issuer = T3Client.create({ baseUrl: url, accessToken: process.env["T3_LIVE_TOKEN"]! });
  const profiles = new ProfileManager({ configDir: directory });
  let client: T3Client | undefined;
  try {
    const pair = await issuer.auth.createPairingCredential({
      label: "sample-cli",
      scopes: ["orchestration:read", "orchestration:operate"],
    });
    await profiles.pair({ name: "sample", url }, pair.credential);
    const env = { ...process.env, T3C_CONFIG_HOME: directory, T3_SERVER_URL: " \t ", T3_TOKEN: "" };
    const output = NodeChildProcess.execFileSync(
      process.execPath,
      ["dist/cli.js", "version", "--json"],
      { env, encoding: "utf8" },
    );
    const result = JSON.parse(output);
    expect(result).toMatchObject({
      data: {
        target: "0.1.2",
        server: { version: "0.1.2", protocol: 2, verdict: "match" },
        sources: { server: "profile", credentials: "profile" },
      },
      exitCode: 0,
    });
    expect(output.trim().split("\n")).toHaveLength(1);
    const evidence: Record<string, unknown> = {
      serverHome: process.env["T3_LIVE_HOME"] ?? "caller-owned",
      profileHome: directory,
      version: result.data.server,
      overrides: "blank server/token fall through to profile",
    };
    console.log(
      JSON.stringify({
        serverHome: process.env["T3_LIVE_HOME"] ?? "caller-owned",
        profileHome: directory,
        version: result.data.server,
        overrides: "blank server/token fall through to profile",
      }),
    );
    if (process.env["T3_LIVE_AGENT"] === "1") {
      client = T3Client.create(await profiles.resolve({ env: {} }));
      const { projectId } = await client.projects.ensureScratch();
      const thread = await client.threads.create({
        projectId,
        title: "Sample CLI check",
        modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
      });
      try {
        const turn = await client.threads.startTurn({
          threadId: thread.id,
          text: "Reply with SAMPLE only.",
        });
        const outcome = await turn.completion;
        expect(outcome.state).toBe("completed");
        evidence["subject"] = { threadId: thread.id, model: "gpt-6-luna", state: outcome.state };
        expect(outcome.assistantMessage?.text).toContain("SAMPLE");
        console.log(
          JSON.stringify({ threadId: thread.id, model: "gpt-6-luna", state: outcome.state }),
        );
      } finally {
        await client.threads.delete(thread.id);
      }
    }
    if (process.env["T3C_ACCEPTANCE_EVIDENCE"])
      await NodeFSP.writeFile(process.env["T3C_ACCEPTANCE_EVIDENCE"], JSON.stringify(evidence));
  } finally {
    await client?.close();
    await issuer.close();
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});
