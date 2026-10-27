// ---
// relationships:
//   verifies: command-line
// ---
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { schemas, T3Client, type ScheduledTaskUpsertInput } from "@wyrd-company/t3code-lib";
import {
  intervalTask,
  webhookTask,
} from "../../../t3code-lib/test/support/scheduledTaskFixtures.ts";
import { runWith, sampleProvider } from "../../test/support/automationHarness.ts";
import { scheduleHandlers } from "./schedule.ts";

const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
const interval = schemas.scheduledTask.ScheduledTask.parse(intervalTask);
const webhook = schemas.scheduledTask.ScheduledTask.parse(webhookTask);
const files: Record<string, string> = {};
const handlers = scheduleHandlers(async (path) => files[path] ?? "");
const run = (args: string[]) => runWith(client, handlers, ["schedule", ...args]);
const project = {
  id: "project-sample",
  title: "Sample",
  workspaceRoot: "/sample",
  defaultModelSelection: null,
};
let upserts: ScheduledTaskUpsertInput[];

beforeEach(() => {
  upserts = [];
  vi.spyOn(client.projects, "get").mockResolvedValue(project as never);
  vi.spyOn(client.projects, "ensureScratch").mockResolvedValue({ projectId: project.id } as never);
  vi.spyOn(client.scheduledTasks, "validateTarget").mockResolvedValue();
  vi.spyOn(client.server, "getConfig").mockResolvedValue({ providers: [sampleProvider] } as never);
  vi.spyOn(client.server, "getSettings").mockResolvedValue({
    defaultRuntimeMode: "approval-required",
  } as never);
  vi.spyOn(client.scheduledTasks, "list").mockResolvedValue([interval, webhook]);
  vi.spyOn(client.scheduledTasks, "upsert").mockImplementation(async (input) => {
    upserts.push(input);
    const stored = input.id === webhook.id ? webhook : interval;
    return { ...stored, ...(input as object) } as never;
  });
});
afterEach(() => vi.restoreAllMocks());

it("creates a task from flags with catalog, server and root defaults", async () => {
  const result = await run([
    "create",
    "--title",
    "Sample",
    "--prompt",
    "Summarize the sample notes.",
    "--at",
    "09:30",
    "--weekdays",
    "5,1,3",
    "--model-option",
    "speed=fast",
    "--disabled",
  ]);
  expect(result.code).toBe(0);
  expect(upserts).toEqual([
    {
      title: "Sample",
      prompt: "Summarize the sample notes.",
      enabled: false,
      schedule: { type: "fixed_time", timeOfDay: "09:30", weekdays: [1, 3, 5] },
      projectId: "project-sample",
      workspaceStrategy: { type: "root" },
      modelSelection: {
        instanceId: "sample-provider",
        model: "sample-model",
        options: [{ id: "speed", value: "fast" }],
      },
      runtimeMode: "approval-required",
      interactionMode: "default",
    },
  ]);
});

it("lets flags override JSON input and sends worktree and thread selections", async () => {
  files["task.json"] = JSON.stringify({
    title: "From input",
    prompt: "Input prompt.",
    schedule: { type: "webhook", signature: null, filters: [] },
    runtimeMode: "full-access",
    modelSelection: { instanceId: "sample-provider", model: "sample-model" },
  });
  vi.spyOn(client.threads, "get").mockResolvedValue({
    id: "thread-sample",
    projectId: "project-sample",
  } as never);
  const result = await run([
    "create",
    "--input",
    "task.json",
    "--title",
    "From flags",
    "--thread",
    "thread-sample",
    "--worktree",
    "--branch",
    "sample-branch",
    "--no-start-from-origin",
    "--interaction-mode",
    "plan",
  ]);
  expect(result.code).toBe(0);
  expect(upserts[0]).toEqual({
    title: "From flags",
    prompt: "Input prompt.",
    enabled: true,
    schedule: { type: "webhook", signature: null, filters: [] },
    projectId: "project-sample",
    threadId: "thread-sample",
    workspaceStrategy: {
      type: "worktree",
      baseRef: "HEAD",
      branch: "sample-branch",
      startFromOrigin: false,
    },
    modelSelection: { instanceId: "sample-provider", model: "sample-model" },
    runtimeMode: "full-access",
    interactionMode: "plan",
  });
});

it("fails on missing selected resources and invalid model options before mutating", async () => {
  vi.spyOn(client.threads, "get").mockResolvedValue(undefined);
  const base = ["create", "--title", "Sample", "--prompt", "Sample", "--every", "1h"];
  expect((await run([...base, "--thread", "thread-absent"])).code).toBe(10);
  expect((await run([...base, "--model", "absent-model"])).code).toBe(10);
  expect((await run([...base, "--model-option", "speed=medium"])).code).toBe(2);
  expect((await run([...base, "--model-option", "verbose=yes"])).code).toBe(2);
  expect((await run([...base, "--model-option", "absent=true"])).code).toBe(2);
  expect(upserts).toEqual([]);
});

it("updates only supplied fields and keeps stored webhook settings", async () => {
  expect((await run(["update", webhook.id, "--prompt", "New prompt."])).code).toBe(0);
  expect((await run(["update", webhook.id, "--webhook"])).code).toBe(0);
  files["clear.json"] = JSON.stringify({ schedule: { type: "webhook", signature: null } });
  expect((await run(["update", webhook.id, "--input", "clear.json"])).code).toBe(0);
  const stored = {
    header: "x-sample-signature",
    encoding: "hex",
    prefix: "sha256=",
  };
  expect(upserts[0]).toMatchObject({
    id: webhook.id,
    requireExisting: true,
    prompt: "New prompt.",
    title: "Sample task",
    schedule: { type: "webhook", signature: stored, maxDeliveryAgeMinutes: 30 },
  });
  // Dedupe and filters stay omitted so the server keeps the stored values.
  expect(upserts[0]!.schedule).not.toHaveProperty("filters");
  expect(upserts[1]!.schedule).toEqual({
    type: "webhook",
    signature: stored,
    maxDeliveryAgeMinutes: 30,
  });
  expect(upserts[2]!.schedule).toEqual({
    type: "webhook",
    signature: null,
    maxDeliveryAgeMinutes: 30,
  });
});

it("applies model options to the stored model and clears them on request", async () => {
  const update = vi.spyOn(client.scheduledTasks, "update");
  await run(["update", interval.id, "--model-option", "verbose=true"]);
  await run(["update", interval.id, "--clear-model-options"]);
  await run(["update", interval.id, "--new-thread", "--mode", "auto"]);
  expect(update.mock.calls.map((call) => call[1])).toEqual([
    {
      modelSelection: {
        instanceId: "sample-provider",
        model: "sample-model",
        options: [{ id: "verbose", value: true }],
      },
    },
    { modelSelection: { instanceId: "sample-provider", model: "sample-model", options: [] } },
    { threadId: null, runtimeMode: "auto" },
  ]);
  expect((await run(["update", "scheduled-task:absent", "--prompt", "Sample"])).code).toBe(10);
});

it("reads structured stdin and prompt files, preserving omitted updates", async () => {
  files["-"] = JSON.stringify({ title: "From stdin", enabled: false });
  files["prompt.txt"] = "Sample prompt from file.\n";
  const update = vi.spyOn(client.scheduledTasks, "update");
  expect(
    (await run(["update", interval.id, "--input", "-", "--prompt-file", "prompt.txt"])).code,
  ).toBe(0);
  expect(update).toHaveBeenLastCalledWith(interval.id, {
    title: "From stdin",
    enabled: false,
    prompt: "Sample prompt from file.",
  });
});

it("resolves an existing workspace through the shared launch helper", async () => {
  const refs = vi.spyOn(client.vcs, "listRefs").mockResolvedValue({
    refs: [{ name: "sample-branch", worktreePath: "/sample/worktree" }],
    nextCursor: null,
  } as never);
  const update = vi.spyOn(client.scheduledTasks, "update");
  expect((await run(["update", interval.id, "--existing-worktree", "/sample/worktree"])).code).toBe(
    0,
  );
  expect(refs).toHaveBeenCalledWith({ cwd: "/sample", refKind: "local", limit: 200 }, undefined);
  expect(update).toHaveBeenLastCalledWith(interval.id, {
    workspaceStrategy: {
      type: "existing_worktree",
      worktreePath: "/sample/worktree",
      branch: "sample-branch",
    },
  });
  refs.mockResolvedValue({ refs: [], nextCursor: null } as never);
  update.mockClear();
  expect((await run(["update", interval.id, "--existing-worktree", "/sample/absent"])).code).toBe(
    10,
  );
  expect(update).not.toHaveBeenCalled();
});

it("validates JSON model selections and composes option overrides and clearing", async () => {
  files["selection.json"] = JSON.stringify({
    modelSelection: {
      instanceId: "sample-provider",
      model: "sample-model",
      options: [{ id: "speed", value: "slow" }],
    },
  });
  const update = vi.spyOn(client.scheduledTasks, "update");
  expect(
    (
      await run([
        "update",
        interval.id,
        "--input",
        "selection.json",
        "--model-option",
        "speed=fast",
        "--model-option",
        "verbose=false",
      ])
    ).code,
  ).toBe(0);
  expect(update.mock.lastCall?.[1].modelSelection?.options).toEqual([
    { id: "speed", value: "fast" },
    { id: "verbose", value: false },
  ]);
  expect(
    (await run(["update", interval.id, "--input", "selection.json", "--clear-model-options"])).code,
  ).toBe(0);
  expect(update.mock.lastCall?.[1].modelSelection?.options).toEqual([]);
  files["selection.json"] = JSON.stringify({
    modelSelection: { instanceId: "sample-provider", model: "absent-model" },
  });
  update.mockClear();
  expect((await run(["update", interval.id, "--input", "selection.json"])).code).toBe(10);
  expect(update).not.toHaveBeenCalled();
});

it("normalizes the library's object option form and lets project-path override JSON", async () => {
  files["task.json"] = JSON.stringify({
    title: "Sample",
    prompt: "Sample",
    projectId: "project-from-input",
    schedule: { type: "interval", everyMs: 3_600_000 },
    modelSelection: {
      instanceId: "sample-provider",
      model: "sample-model",
      options: { verbose: false },
    },
  });
  const ensure = vi.spyOn(client.projects, "ensure").mockResolvedValue(project as never);
  expect((await run(["create", "--input", "task.json", "--project-path", "/sample"])).code).toBe(0);
  expect(ensure).toHaveBeenCalledWith({ workspaceRoot: "/sample", title: "sample" });
  expect(upserts[0]?.modelSelection.options).toEqual([{ id: "verbose", value: false }]);
  expect(upserts[0]?.projectId).toBe(project.id);
});
