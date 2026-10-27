// ---
// relationships:
//   verifies: command-line
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  schemas,
  T3AuthError,
  T3Client,
  T3PreconditionError,
  type ScheduledTask,
} from "@wyrd-company/t3code-lib";
import {
  deliverySummary,
  intervalTask,
  webhookTask,
} from "../../../t3code-lib/test/support/scheduledTaskFixtures.ts";
import { runWith } from "../../test/support/automationHarness.ts";
import { scheduleHandlers } from "./schedule.ts";

const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
const interval = schemas.scheduledTask.ScheduledTask.parse(intervalTask);
const webhook = schemas.scheduledTask.ScheduledTask.parse(webhookTask);
const files: Record<string, string> = {};
const handlers = scheduleHandlers(async (path) => {
  if (!(path in files)) throw new Error("missing sample file");
  return files[path]!;
});
const run = (args: string[], json = true) => runWith(client, handlers, ["schedule", ...args], json);
afterEach(() => vi.restoreAllMocks());

it("lists and shows tasks with JSON envelopes and concise text", async () => {
  vi.spyOn(client.scheduledTasks, "list").mockResolvedValue([interval, webhook]);
  const listed = await run(["list"]);
  expect(listed.code).toBe(0);
  expect(listed.result.data.map((task: ScheduledTask) => task.id)).toEqual([
    interval.id,
    webhook.id,
  ]);
  expect((await run(["list"], false)).stdout).toBe(
    `${interval.id}\tenabled\tinterval\t-\tSample task\n${webhook.id}\tenabled\twebhook\t-\tSample task\n`,
  );
  const shown = await run(["show", webhook.id], false);
  expect(shown.stdout).toContain("trigger\twebhook\tsigned\n");
  // The URL token stays out of show text.
  expect(shown.stdout).not.toContain("sample-token");
  expect((await run(["show", interval.id], false)).stdout).toContain("trigger\tinterval\t1h\n");
  const missing = await run(["show", "scheduled-task:absent"]);
  expect(missing).toMatchObject({ code: 10, result: { data: null, exitCode: 10 } });
});

it("enables, disables, deletes and runs through the library facade", async () => {
  const setEnabled = vi
    .spyOn(client.scheduledTasks, "setEnabled")
    .mockImplementation(async (_id, enabled) => ({ ...interval, enabled }));
  const remove = vi.spyOn(client.scheduledTasks, "delete").mockResolvedValue();
  const runNow = vi.spyOn(client.scheduledTasks, "runNow").mockResolvedValue(interval);
  expect((await run(["disable", interval.id], false)).stdout).toContain("\tdisabled\t");
  expect((await run(["enable", interval.id])).result.data.enabled).toBe(true);
  expect(setEnabled.mock.calls.map((call) => call.slice(0, 2))).toEqual([
    [interval.id, false],
    [interval.id, true],
  ]);
  expect((await run(["delete", interval.id])).result).toEqual({
    data: { taskId: interval.id },
    exitCode: 0,
  });
  expect(remove).toHaveBeenCalledWith(interval.id);
  expect((await run(["run", interval.id])).code).toBe(0);
  expect(runNow).toHaveBeenCalledWith(interval.id);
});

it("reports webhook endpoints, rotation and deliveries", async () => {
  const endpoint = {
    taskId: webhook.id,
    path: "/api/hooks/sample",
    url: "http://127.0.0.1:1/api/hooks/sample",
    connectUrl: null,
    hasSecret: true,
  };
  vi.spyOn(client.scheduledTasks, "webhookEndpoint").mockResolvedValue(endpoint);
  const rotate = vi.spyOn(client.scheduledTasks, "rotateWebhookToken").mockResolvedValue(webhook);
  expect((await run(["endpoint", webhook.id])).result.data).toEqual(endpoint);
  expect((await run(["endpoint", webhook.id], false)).stdout).toBe(
    "url\thttp://127.0.0.1:1/api/hooks/sample\npath\t/api/hooks/sample\nconnect\t-\nsignature\trequired\n",
  );
  expect((await run(["rotate-token", webhook.id])).result.data).toEqual({
    task: expect.objectContaining({ id: webhook.id }),
    endpoint,
  });
  expect(rotate).toHaveBeenCalledWith(webhook.id);
  const summary = schemas.scheduledTask.ScheduledTaskWebhookDeliverySummary.parse({
    ...deliverySummary,
    outcome: "sample_future_outcome",
  });
  vi.spyOn(client.scheduledTasks, "listWebhookDeliveries").mockResolvedValue([summary]);
  expect((await run(["delivery", "list", webhook.id], false)).stdout).toBe(
    "delivery-sample\t2026-01-01T00:00:00.000Z\tsample_future_outcome\tunverified\tPOST\t2B\n",
  );
  const detail = schemas.scheduledTask.ScheduledTaskWebhookDelivery.parse({
    ...deliverySummary,
    query: "",
    headers: { "x-sample-signature": "sha256=00" },
    body: "{}",
    bodyTruncated: false,
    renderedPrompt: null,
  });
  const read = vi.spyOn(client.scheduledTasks, "getWebhookDelivery").mockResolvedValue(detail);
  const shown = await run(["delivery", "show", webhook.id, "delivery-sample"], false);
  expect(shown.stdout).toContain("query\t-\nbody\n{}\n");
  expect(shown.stdout).not.toContain("x-sample-signature");
  expect(read).toHaveBeenCalledWith(webhook.id, "delivery-sample");
});

it("maps endpoint preconditions and missing scopes", async () => {
  const endpoint = vi.spyOn(client.scheduledTasks, "webhookEndpoint");
  endpoint.mockRejectedValueOnce(new T3PreconditionError("sample"));
  expect((await run(["endpoint", interval.id])).code).toBe(2);
  endpoint.mockRejectedValueOnce(
    T3AuthError.insufficientScope("orchestration:operate", "scheduledTasks.webhookEndpoint"),
  );
  expect((await run(["endpoint", webhook.id])).result.error).toMatchObject({
    requiredScope: "orchestration:operate",
  });
});

it("rejects malformed ids and input before connecting", async () => {
  for (const args of [
    ["show", " "],
    ["delivery", "show", webhook.id, " "],
    ["create", "--title", "Sample", "--prompt", "Sample", "--every", "30s"],
    ["create", "--title", "Sample", "--prompt", "Sample", "--at", "25:00"],
    ["create", "--title", "Sample", "--prompt", "Sample", "--at", "09:00", "--weekdays", "1,7"],
    ["create", "--title", "Sample", "--prompt", "Sample", "--every", "1h", "--weekdays", "1"],
    ["create", "--title", "Sample", "--prompt", "Sample", "--every", "1h", "--branch", "sample"],
    ["create", "--title", "Sample", "--every", "1h"],
    ["create", "--title", "Sample", "--prompt", "Sample", "--every", "1h", "--model-option", "x"],
    ["create", "--title", " ", "--prompt", "Sample", "--every", "1h"],
    ["update", interval.id],
    ["update", interval.id, "--input", "-", "--prompt-file", "-"],
  ]) {
    const result = await run(args);
    expect(result, args.join(" ")).toMatchObject({ code: 2, connected: false });
  }
  for (const args of [
    ["create", "--every", "1h", "--at", "09:00"],
    ["update", interval.id, "--thread", "thread-1", "--new-thread"],
    ["create", "--worktree", "--root"],
  ])
    expect((await run(args)).code, args.join(" ")).toBe(2);
});

it("rejects JSON input that is malformed, unsupported or invalid", async () => {
  files["bad.json"] = "{";
  files["array.json"] = "[]";
  files["extra.json"] = JSON.stringify({ id: "scheduled-task:other" });
  files["invalid.json"] = JSON.stringify({ schedule: { type: "interval", everyMs: 1000 } });
  for (const file of ["bad.json", "array.json", "extra.json", "invalid.json"]) {
    const result = await run(["update", interval.id, "--input", file]);
    expect(result, file).toMatchObject({ code: 2, connected: false });
    expect(result.stderr).not.toContain("scheduled-task:other");
  }
  expect((await run(["update", interval.id, "--input", "absent.json"])).code).toBe(1);
});
