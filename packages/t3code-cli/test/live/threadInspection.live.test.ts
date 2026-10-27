// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { T3Client, providerInstanceId, type ThreadId } from "@wyrd-company/t3code-lib";

function t3c(args: string[]) {
  const result = NodeChildProcess.spawnSync(
    process.execPath,
    ["dist/cli.js", "thread", ...args, "--json"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        T3_SERVER_URL: process.env["T3_LIVE_URL"],
        T3_TOKEN: process.env["T3_LIVE_TOKEN"],
      },
    },
  );
  return { code: result.status, result: JSON.parse(result.stdout) };
}

it("inspects, diffs and searches a blank thread against stock T3 Code", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-thread-inspection-"));
  const client = T3Client.create({
    baseUrl: process.env["T3_LIVE_URL"]!,
    accessToken: process.env["T3_LIVE_TOKEN"]!,
  });
  let subject: ThreadId | undefined;
  let project: Awaited<ReturnType<T3Client["projects"]["ensure"]>> | undefined;
  try {
    project = await client.projects.ensure({ workspaceRoot: root, title: "Sample" });
    subject = (
      await client.threads.create({
        projectId: project.id,
        title: "Sample",
        modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
      })
    ).id;

    const status = t3c(["status", subject]);
    expect(status.code).toBe(0);
    expect(status.result.data).toMatchObject({
      thread: { id: subject, projectId: project.id },
      activeRun: null,
      latestRun: null,
      queuedRuns: [],
      queueHeld: false,
      pendingRequests: { approvals: 0, questions: 0 },
      backgroundWork: [],
    });
    expect(t3c(["requests", subject]).result).toEqual({ data: [], exitCode: 0 });
    const usage = t3c(["usage", subject]).result.data;
    expect(usage).toEqual({ threadId: subject, providerThreads: [], providerTurns: [] });
    expect(t3c(["diff", subject]).result).toEqual({
      data: { threadId: subject, fromTurnCount: 0, toTurnCount: 0, diff: "" },
      exitCode: 0,
    });
    const unavailable = t3c(["diff", subject, "--from-turn", "0", "--to-turn", "1"]);
    expect(unavailable.code).not.toBe(0);
    expect(unavailable.result.error).toBeDefined();
    const search = t3c(["search", "sample-absent-needle", "--limit", "5"]);
    expect(search.result).toEqual({ data: { matches: [], limit: 5 }, exitCode: 0 });
    const within = t3c(["search", "sample-absent-needle", "--thread", subject]);
    expect(within.code).toBe(0);
    expect(within.result.data).toMatchObject({ totalMatches: 0, match: null });
    const missing = t3c(["status", "sample-missing-thread"]);
    expect(missing.code).toBe(10);
    expect(missing.result.error).toBeDefined();
  } finally {
    try {
      if (subject) await client.threads.delete(subject);
      if (project) await client.projects.delete(project.id, { force: true });
    } finally {
      await client.close();
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  }
});
