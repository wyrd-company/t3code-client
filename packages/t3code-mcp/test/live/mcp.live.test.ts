// ---
// relationships:
//   verifies: mcp
// ---
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { T3Client, providerInstanceId } from "@wyrd-company/t3code-lib";
import { expect, it } from "vite-plus/test";

it("serves additive tools through stdio against an isolated stock server without agent runs", async () => {
  const baseUrl = process.env["T3_LIVE_URL"]!;
  const token = process.env["T3_LIVE_TOKEN"]!;
  const upstream = T3Client.create({ baseUrl, accessToken: token });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/cli.js", "serve", "--server", baseUrl],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
      T3_TOKEN: token,
    },
    stderr: "pipe",
  });
  const mcp = new Client({ name: "sample-live-client", version: "1.0.0" });
  const root = await mkdtemp(join(tmpdir(), "t3code-mcp-live-"));
  let project: Awaited<ReturnType<T3Client["projects"]["ensure"]>> | undefined;
  let thread: Awaited<ReturnType<T3Client["threads"]["create"]>> | undefined;
  let task: Awaited<ReturnType<T3Client["scheduledTasks"]["upsert"]>> | undefined;
  async function call(name: string, args: Record<string, unknown>) {
    const result = await mcp.callTool({ name, arguments: args });
    expect(Boolean(result.isError)).toBe(false);
    return result.structuredContent as Record<string, unknown>;
  }
  try {
    await mcp.connect(transport);
    project = await upstream.projects.ensure({ workspaceRoot: root, title: "Sample" });
    const selection = { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" };
    thread = await upstream.threads.create({
      projectId: project.id,
      title: "Sample",
      modelSelection: selection,
    });
    task = await upstream.scheduledTasks.upsert({
      title: "Sample disabled webhook",
      prompt: "Reply with SAMPLE only.",
      enabled: false,
      projectId: project.id,
      threadId: thread.id,
      workspaceStrategy: { type: "root" },
      modelSelection: selection,
      runtimeMode: "approval-required",
      interactionMode: "default",
      schedule: { type: "webhook" },
    });
    const id = task.id;
    const endpoint = await call("scheduled_task_endpoint", { id });
    expect(new URL(String(endpoint["url"]))["origin"] === new URL(baseUrl).origin).toBe(true);
    expect(typeof endpoint["path"]).toBe("string");
    const response = await fetch(String(endpoint["url"]), {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
    await response.body?.cancel();
    expect(response.status).toBe(409);
    const deliveries = await call("scheduled_task_deliveries", { id });
    const rows = deliveries["deliveries"] as { id: string; outcome: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.outcome).toBe("disabled");
    const delivery = await call("scheduled_task_delivery", { id, deliveryId: rows[0]!.id });
    expect(delivery["outcome"]).toBe("disabled");
    const changed = await call("configure_scheduled_task", {
      id,
      configuration: { threadId: null, runtimeMode: "full-access" },
    });
    expect(changed["threadId"]).toBeNull();
    const config = await call("scheduled_task_configuration", { id });
    expect(config["enabled"]).toBe(false);
    expect(config["runtimeMode"]).toBe("full-access");
    expect(config["runCount"]).toBe(0);
    const rotated = await call("rotate_scheduled_task_webhook", { id });
    expect(rotated["path"] !== endpoint["path"]).toBe(true);
    const old = await fetch(String(endpoint["url"]), { method: "POST", body: "{}" });
    await old.body?.cancel();
    expect(old.status).toBe(404);
    const threadInput = { threadId: thread.id };
    expect((await call("thread_status", threadInput))["activeRun"]).toBeNull();
    expect(await call("thread_stop", { ...threadInput, reason: "" })).toEqual(threadInput);
    expect(await call("thread_queue_resume", threadInput)).toEqual(threadInput);
    const invalidStart = await mcp.callTool({
      name: "thread_queue_start",
      arguments: { ...threadInput, runId: "sample-absent-run" },
    });
    expect(invalidStart).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "rpc_failed" } },
    });
    const afterControls = await upstream.threads.projection(thread.id);
    expect(afterControls.runs).toEqual([]);
    expect(afterControls.providerThreads).toEqual([]);
    expect(afterControls.messages).toEqual([]);
    expect((await upstream.threads.get(thread.id))?.status).toBe("idle");
    expect((await call("thread_approvals", threadInput))["approvals"]).toEqual([]);
    expect((await call("thread_usage", threadInput))["providerTurns"]).toEqual([]);
    expect((await call("thread_diff", threadInput))["diff"]).toBe("");
    expect(
      (await call("thread_search_content", { ...threadInput, query: "sample-absent-needle" }))[
        "totalMatches"
      ],
    ).toBe(0);
    const providers = await call("provider_status", {});
    expect(Array.isArray(providers["providers"])).toBe(true);
    const day = new Date().toISOString().slice(0, 10);
    const usage = await call("usage_summary", {
      sinceDay: day,
      untilDay: day,
      timeZone: "Etc/UTC",
    });
    // Do not print host transcript paths or usage rows, including on failure.
    expect(Array.isArray(usage["buckets"])).toBe(true);
    expect(Array.isArray(usage["sources"])).toBe(true);
    expect(typeof usage["contractVersion"]).toBe("number");
    const missing = await mcp.callTool({
      name: "thread_status",
      arguments: { threadId: "sample-absent-thread" },
    });
    expect(missing).toMatchObject({
      isError: true,
      structuredContent: { error: { code: "not_found" } },
    });
  } finally {
    await mcp.close();
    try {
      if (task) await upstream.scheduledTasks.delete(task.id);
      if (thread) await upstream.threads.delete(thread.id);
      if (project) await upstream.projects.delete(project.id, { force: true });
    } finally {
      await upstream.close();
      await rm(root, { recursive: true, force: true });
    }
  }
});
