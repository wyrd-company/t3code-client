// ---
// relationships:
//   verifies: command-line
//   references: automation-capabilities, testing
// ---
/** Built CLI against a fresh stock server; no accepted webhook or manual agent run. */
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import {
  ProfileManager,
  T3Client,
  type ModelSelection,
  type ProjectId,
  type ScheduledTaskId,
} from "@wyrd-company/t3code-lib";

import { liveCatalogSelection } from "../support/liveCatalog.ts";

let selection: ModelSelection;
let directory: string;
let client: T3Client;
let env: NodeJS.ProcessEnv;
let projectId: ProjectId;
const tasks = new Set<ScheduledTaskId>();

beforeAll(async () => {
  directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-automation-"));
  const url = process.env["T3_LIVE_URL"]!;
  const issuer = T3Client.create({ baseUrl: url, accessToken: process.env["T3_LIVE_TOKEN"]! });
  try {
    selection = await liveCatalogSelection(issuer);
    const profiles = new ProfileManager({ configDir: NodePath.join(directory, "config") });
    const pairing = await issuer.auth.createPairingCredential({
      label: "sample-automation",
      scopes: ["orchestration:read", "orchestration:operate", "diagnostics:read"],
    });
    await profiles.pair({ name: "sample", url }, pairing.credential);
    client = T3Client.create(await profiles.resolve({ env: {} }));
    projectId = (
      await client.projects.ensure({ workspaceRoot: directory, title: "Sample automation" })
    ).id;
    env = {
      ...process.env,
      T3C_CONFIG_HOME: NodePath.join(directory, "config"),
      T3_SERVER_URL: "",
      T3_TOKEN: "",
    };
  } finally {
    await issuer.close();
  }
});

afterAll(async () => {
  try {
    for (const id of tasks) await client.scheduledTasks.delete(id);
    if (projectId) await client.projects.delete(projectId);
  } finally {
    await client?.close();
    if (directory) await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});

function cli(
  args: string[],
  input = "",
): Promise<{ exit: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(process.execPath, ["dist/cli.js", ...args], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code, signal) =>
      signal
        ? reject(new Error(`CLI killed by ${signal}`))
        : resolve({ exit: code ?? 1, stdout, stderr }),
    );
    child.stdin.end(input);
  });
}

async function json(args: string[], input = "", exit = 0) {
  const result = await cli([...args, "--json"], input);
  expect(result.exit, result.stderr).toBe(exit);
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  const value = JSON.parse(result.stdout);
  expect(value.exitCode).toBe(exit);
  return value;
}

it("creates, reads, updates, enables, disables and deletes a task through the executable", async () => {
  const before = (await client.threads.list()).map((thread) => thread.id).sort();
  const created = await json([
    "schedule",
    "create",
    "--title",
    "Sample interval",
    "--prompt",
    "Summarize the sample notes.",
    "--every",
    "1h",
    "--project",
    projectId,
    "--provider",
    selection.instanceId,
    "--model",
    selection.model,
    "--mode",
    "approval-required",
    "--disabled",
  ]);
  const id = created.data.id as ScheduledTaskId;
  tasks.add(id);
  expect(created.data).toMatchObject({
    enabled: false,
    runCount: 0,
    schedule: { type: "interval", everyMs: 3_600_000 },
  });
  expect(
    (await json(["schedule", "list"])).data.some((task: { id: string }) => task.id === id),
  ).toBe(true);
  expect((await cli(["schedule", "show", id])).stdout).toContain("trigger\tinterval\t1h");
  const changed = await json(
    ["schedule", "update", id, "--input", "-"],
    JSON.stringify({
      title: "Sample fixed time",
      schedule: { type: "fixed_time", timeOfDay: "03:15", weekdays: [0] },
    }),
  );
  expect(changed.data).toMatchObject({
    enabled: false,
    prompt: "Summarize the sample notes.",
    schedule: { type: "fixed_time", timeOfDay: "03:15", weekdays: [0] },
  });
  // Enabling an hourly interval leaves its next trigger in the future.
  await json(["schedule", "update", id, "--every", "1h"]);
  expect((await json(["schedule", "enable", id])).data.enabled).toBe(true);
  expect((await json(["schedule", "disable", id])).data.enabled).toBe(false);
  expect((await json(["schedule", "delete", id])).data).toEqual({ taskId: id });
  tasks.delete(id);
  await json(["schedule", "show", id], "", 10);
  expect((await client.threads.list()).map((thread) => thread.id).sort()).toEqual(before);
});

it("reads endpoints and deliveries, keeps omitted signing settings, and rotates URL tokens", async () => {
  const before = (await client.threads.list()).map((thread) => thread.id).sort();
  const file = NodePath.join(directory, "task.json");
  await NodeFSP.writeFile(
    file,
    JSON.stringify({
      title: "Sample webhook",
      prompt: "Summarize {{body.action}}.",
      enabled: false,
      projectId,
      modelSelection: selection,
      runtimeMode: "approval-required",
      schedule: {
        type: "webhook",
        signature: {
          header: "x-sample-signature",
          encoding: "hex",
          prefix: "sha256=",
          secret: "sample-signing-value",
        },
        filters: [{ path: "body.action", op: "equals", value: "sample" }],
      },
    }),
  );
  const created = await json(["schedule", "create", "--input", file]);
  const id = created.data.id as ScheduledTaskId;
  tasks.add(id);
  const endpoint = (await json(["schedule", "endpoint", id])).data;
  expect(endpoint).toMatchObject({ taskId: id, hasSecret: true, connectUrl: null });
  expect((await cli(["schedule", "endpoint", id])).stdout).toContain("signature\trequired");
  const post = async (url: string) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sample-signature": "sha256=00" },
      body: "{}",
    });
    await response.body?.cancel();
    return response.status;
  };
  await post(endpoint.url);
  await json(["schedule", "enable", id]);
  try {
    expect(await post(endpoint.url)).toBe(401);
  } finally {
    await json(["schedule", "disable", id]);
  }
  const rows = (await json(["schedule", "delivery", "list", id])).data as {
    id: string;
    outcome: string;
  }[];
  expect(rows.map((row) => row.outcome).sort()).toEqual(["disabled", "rejected_signature"]);
  expect((await json(["schedule", "delivery", "show", id, rows[0]!.id])).data).toMatchObject({
    taskId: id,
    body: "{}",
    method: "POST",
  });
  const kept = (await json(["schedule", "update", id, "--prompt", "Updated sample prompt."])).data;
  expect(kept.webhook.hasSecret).toBe(true);
  expect(kept.schedule.filters).toEqual([{ path: "body.action", op: "equals", value: "sample" }]);
  const rotated = (await json(["schedule", "rotate-token", id])).data;
  expect(rotated.endpoint.path).not.toBe(endpoint.path);
  expect(await post(endpoint.url)).toBe(404);
  // The stock scheduler refuses manual webhook runs; this never invokes a provider.
  await json(["schedule", "run", id], "", 1);
  const cleared = await json(
    ["schedule", "update", id, "--input", "-"],
    JSON.stringify({ schedule: { type: "webhook", signature: null, filters: [] } }),
  );
  expect(cleared.data.webhook.hasSecret).toBe(false);
  expect(cleared.data.runCount).toBe(0);
  expect((await client.threads.list()).map((thread) => thread.id).sort()).toEqual(before);
});

it("reports exact provider diagnostics and historical usage without starting an agent", async () => {
  const providers = (await json(["provider", "status", "codex"])).data;
  expect(providers.map((provider: { instanceId: string }) => provider.instanceId)).toEqual([
    "codex",
  ]);
  expect((await cli(["provider", "status", "codex"])).stdout).toContain("codex\t");
  await json(["provider", "status", "sample-absent"], "", 10);
  const args = [
    "usage",
    "summary",
    "--since-day",
    "2026-01-01",
    "--until-day",
    "2026-01-01",
    "--time-zone",
    "Etc/UTC",
    "--await-refresh",
  ];
  expect((await json(args)).data).toMatchObject({
    sinceDay: "2026-01-01",
    untilDay: "2026-01-01",
    timeZone: "Etc/UTC",
    buckets: expect.any(Array),
    sources: expect.any(Array),
  });
  expect((await cli(args)).stdout).toContain("pricing\t");
  expect(
    (
      await json([
        ...args,
        "--resolution",
        "hour",
        "--since-time",
        "2026-01-01T00:00:00Z",
        "--until-time",
        "2026-01-02T00:00:00Z",
      ])
    ).data.timeZone,
  ).toBe("Etc/UTC");
});
