// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vite-plus/test";
import { T3Client, providerInstanceId, type ThreadId } from "@wyrd-company/t3code-lib";

const execFile = promisify(NodeChildProcess.execFile);
async function lookup(provider: string, session: string, json = true) {
  const { stdout } = await execFile(
    process.execPath,
    [
      "dist/cli.js",
      "thread",
      "find",
      "--provider",
      provider,
      "--session",
      session,
      ...(json ? ["--json"] : []),
    ],
    {
      env: {
        ...process.env,
        T3_SERVER_URL: process.env["T3_LIVE_URL"],
        T3_TOKEN: process.env["T3_LIVE_TOKEN"],
      },
    },
  );
  return stdout;
}

it("returns null for a missing native session against stock T3 Code", async () => {
  expect(JSON.parse(await lookup("sample-provider", "missing-native-session"))).toEqual({
    data: null,
    exitCode: 0,
  });
  expect(await lookup("sample-provider", "missing-native-session", false)).toBe("null\n");
});

it.skipIf(process.env["T3_LIVE_AGENT"] !== "1")(
  "resolves a real provider session before and after archiving its T3 thread",
  async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-session-lookup-"));
    const client = T3Client.create({
      baseUrl: process.env["T3_LIVE_URL"]!,
      accessToken: process.env["T3_LIVE_TOKEN"]!,
    });
    let subject: ThreadId | undefined;
    let project: Awaited<ReturnType<T3Client["projects"]["ensure"]>> | undefined;
    try {
      project = await client.projects.ensure({ workspaceRoot: root, title: "Sample" });
      const thread = await client.threads.create({
        projectId: project.id,
        title: "Sample",
        modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
      });
      subject = thread.id;
      const turn = await client.threads.startTurn({
        threadId: subject,
        text: "Reply with SAMPLE only.",
      });
      expect((await turn.completion).state).toBe("completed");
      const projection = await client.threads.projection(subject);
      const nativeId = projection.providerThreads.find(
        (candidate) =>
          candidate.appThreadId === subject &&
          candidate.providerInstanceId === "codex" &&
          candidate.nativeThreadRef?.nativeId != null,
      )?.nativeThreadRef?.nativeId;
      expect(nativeId).toBeTruthy();
      expect(JSON.parse(await lookup("codex", nativeId!))).toEqual({ data: subject, exitCode: 0 });
      expect(await lookup("codex", nativeId!, false)).toBe(`${subject}\n`);
      expect(JSON.parse(await lookup("sample-provider", nativeId!)).data).toBeNull();
      await client.threads.archive(subject);
      expect(JSON.parse(await lookup("codex", nativeId!))).toEqual({ data: subject, exitCode: 0 });
    } finally {
      try {
        if (subject) await client.threads.delete(subject);
        if (project) await client.projects.delete(project.id, { force: true });
      } finally {
        await client.close();
        await NodeFSP.rm(root, { recursive: true, force: true });
      }
    }
  },
);
