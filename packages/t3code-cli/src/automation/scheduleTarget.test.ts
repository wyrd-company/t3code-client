// ---
// relationships:
//   verifies: command-line
//   references: automation-capabilities
// ---
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { schemas, T3AuthError, T3Client, T3ConnectionError } from "@wyrd-company/t3code-lib";
import { intervalTask } from "../../../t3code-lib/test/support/scheduledTaskFixtures.ts";
import { makeAppThread, makeProjection } from "../../../t3code-lib/test/support/threadFixtures.ts";
import { runWith, sampleProvider } from "../../test/support/automationHarness.ts";
import { scheduleHandlers } from "./schedule.ts";

const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
const handlers = scheduleHandlers();
const run = (args: string[]) => runWith(client, handlers, ["schedule", ...args]);
const task = schemas.scheduledTask.ScheduledTask.parse(intervalTask);
const project = {
  id: "project-sample",
  title: "Sample",
  workspaceRoot: "/sample",
  defaultModelSelection: null,
};

beforeEach(() => {
  vi.spyOn(client.projects, "get").mockImplementation(async (id) => ({ ...project, id }) as never);
  vi.spyOn(client.threads, "get").mockImplementation(
    async (id) =>
      ({ id, projectId: id === "thread-other" ? "project-other" : project.id }) as never,
  );
  vi.spyOn(client.server, "getConfig").mockResolvedValue({ providers: [sampleProvider] } as never);
  vi.spyOn(client.server, "getSettings").mockResolvedValue({
    defaultRuntimeMode: "approval-required",
  } as never);
  vi.spyOn(client.scheduledTasks, "list").mockResolvedValue([task]);
  vi.spyOn(client.scheduledTasks, "upsert").mockImplementation(async (input) =>
    schemas.scheduledTask.ScheduledTask.parse({ ...task, ...input }),
  );
  // Only the projection boundary is stubbed; both facades run their real target checks.
  vi.spyOn(client.rpc, "call").mockImplementation(async (_method, payload) => {
    const { threadId } = payload as { threadId: string };
    return makeProjection({
      thread: makeAppThread({
        id: threadId,
        projectId: threadId === "thread-other" ? "project-other" : project.id,
      }),
    }) as never;
  });
});
afterEach(() => vi.restoreAllMocks());

const create = [
  "create",
  "--title",
  "Sample",
  "--prompt",
  "Sample",
  "--every",
  "1h",
  "--project",
  project.id,
];

it("rejects an explicit project with another project's bound thread before create", async () => {
  const result = await run([...create, "--thread", "thread-other"]);
  expect(result).toMatchObject({ code: 2, result: { data: null, exitCode: 2 } });
  expect(client.scheduledTasks.upsert).not.toHaveBeenCalled();
  expect(client.rpc.call).toHaveBeenCalledWith(
    "orchestration.getThreadProjection",
    { threadId: "thread-other" },
    undefined,
  );
});

it("rejects a changed thread against the retained project before update", async () => {
  expect((await run(["update", task.id, "--thread", "thread-other"])).code).toBe(2);
  expect(client.scheduledTasks.upsert).not.toHaveBeenCalled();
});

it("checks a changed project against a retained bound thread", async () => {
  vi.mocked(client.scheduledTasks.list).mockResolvedValue([
    { ...task, threadId: schemas.common.threadId("thread-sample") },
  ]);
  expect((await run(["update", task.id, "--project", "project-other"])).code).toBe(2);
  expect(client.scheduledTasks.upsert).not.toHaveBeenCalled();
  expect(client.rpc.call).toHaveBeenCalledWith(
    "orchestration.getThreadProjection",
    { threadId: "thread-sample" },
    undefined,
  );
});

it("accepts a matching target and keeps unrelated partial updates omitted", async () => {
  expect((await run([...create, "--thread", "thread-sample"])).code).toBe(0);
  expect((await run(["update", task.id, "--thread", "thread-sample"])).code).toBe(0);
  vi.mocked(client.rpc.call).mockClear();
  expect((await run(["update", task.id, "--prompt", "Sample changed"])).code).toBe(0);
  expect(client.rpc.call).not.toHaveBeenCalled();
  const last = vi.mocked(client.scheduledTasks.upsert).mock.lastCall?.[0];
  expect(last).toMatchObject({
    projectId: project.id,
    threadId: null,
    prompt: "Sample changed",
    requireExisting: true,
  });
});

it("propagates read authorization and connection failures without saving", async () => {
  vi.mocked(client.rpc.call).mockRejectedValue(
    T3AuthError.insufficientScope("orchestration:read", "sample"),
  );
  expect(await run([...create, "--thread", "thread-sample"])).toMatchObject({
    code: 9,
    result: { error: { requiredScope: "orchestration:read" } },
  });
  vi.mocked(client.rpc.call).mockRejectedValue(new T3ConnectionError("open_failed", "sample"));
  expect((await run(["update", task.id, "--thread", "thread-sample"])).code).toBe(8);
  expect(client.scheduledTasks.upsert).not.toHaveBeenCalled();
});
