// ---
// relationships:
//   verifies: mcp
// ---
import { describe, expect, it } from "vite-plus/test";
import { T3HttpError } from "@wyrd-company/t3code-lib";
import { harness, model, projection, shell, at } from "../../test/support/fakes.ts";
import { allTools } from "../server.ts";
import { launchThreadId } from "./dispatch.ts";
const tool = (name: string) => allTools.find((t) => t.name === name)!;
const base = { server: "alpha", threadId: "thread-1" };
const launch = { projectId: "project-1", modelSelection: model };

describe("discovery and reads", () => {
  it("lists without opening, probes independently, and reports capabilities", async () => {
    const h = harness();
    expect(await tool("server_list").run({}, h.context)).toEqual({
      servers: [{ server: "alpha" }],
    });
    expect(h.server.getConfig).not.toHaveBeenCalled();
    expect(await tool("server_list").run({ probe: true }, h.context)).toMatchObject({
      servers: [{ server: "alpha", reachable: true }],
    });
    expect(await tool("server_capabilities").run({}, h.context)).toMatchObject({
      server: "alpha",
      providers: [{ instanceId: model.instanceId }],
    });
    const missing = harness();
    missing.server.getConfig.mockRejectedValue(new Error("unavailable"));
    expect(await tool("server_list").run({ probe: true }, missing.context)).toMatchObject({
      servers: [{ reachable: false, error: { code: "upstream_error" } }],
    });
  });
  it("lists and ensures projects", async () => {
    const h = harness();
    expect(await tool("project_list").run({}, h.context)).toMatchObject({
      total: 1,
      items: [{ projectId: "project-1" }],
      nextOffset: null,
    });
    expect(
      await tool("project_ensure").run({ workspaceRoot: "/tmp/sample" }, h.context),
    ).toMatchObject({ server: "alpha", projectId: "project-1" });
    expect(h.projects.ensure).toHaveBeenCalledWith(
      { workspaceRoot: "/tmp/sample", title: "sample" },
      h.context.signal,
    );
  });
  it("filters and orders thread pages", async () => {
    const h = harness();
    h.threads.list.mockResolvedValue([
      shell({ id: "older", updatedAt: at }),
      shell({ id: "newer", updatedAt: "2020-01-02T00:00:00.000Z" }),
    ]);
    expect(
      await tool("thread_list").run(
        { title: "sample", status: "idle", settled: false, limit: 1, projectId: "project-1" },
        h.context,
      ),
    ).toMatchObject({ items: [{ threadId: "newer" }], total: 2, nextOffset: 1 });
    expect(await tool("thread_list").run({ status: "completed" }, h.context)).toMatchObject({
      items: [],
      total: 0,
    });
  });
  it("reads and cuts text, falls back only for the transcript size error", async () => {
    const h = harness();
    expect(await tool("thread_read").run({ ...base, maxCharsPerItem: 4 }, h.context)).toMatchObject(
      { server: "alpha", items: [{ text: "A sa" }], truncatedItemIds: ["item-1"] },
    );
    const p = projection();
    const transcript = await h.client.threads.transcript("thread-1" as never);
    p.visibleTurnItems = transcript.items;
    h.threads.detail.mockResolvedValue({ snapshotSequence: 1, projection: p });
    h.threads.transcript.mockRejectedValue(
      new T3HttpError("Large transcript", {
        status: 413,
        method: "GET",
        path: "/sample",
        body: {},
        reason: "thread_transcript_too_large",
      }),
    );
    expect(await tool("thread_read").run({ ...base, view: "activity" }, h.context)).toMatchObject({
      items: [{ text: "A sample response" }],
    });
    h.threads.transcript.mockRejectedValue(
      new T3HttpError("Generic upstream failure", {
        status: 500,
        method: "GET",
        path: "/sample",
        body: {},
        reason: "sample_failure",
      }),
    );
    await expect(tool("thread_read").run(base, h.context)).rejects.toThrow(
      "Generic upstream failure",
    );
    h.threads.transcript.mockRejectedValue(new Error("unexpected"));
    await expect(tool("thread_read").run(base, h.context)).rejects.toThrow("unexpected");
  });
});
describe("dispatch", () => {
  it("requires exactly one project selector before any mutation", async () => {
    const h = harness();
    for (const input of [{ modelSelection: model }, { ...launch, scratch: true }])
      await expect(tool("thread_launch").run(input, h.context)).rejects.toThrow("exactly one");
    expect(h.threads.launch).not.toHaveBeenCalled();
  });
  it("passes idempotent identity, workspace, message and capped mode to launch", async () => {
    const h = harness({ serverPolicies: { alpha: { maxRuntimeMode: "auto-accept-edits" } } });
    h.threads.get.mockResolvedValue(undefined);
    await tool("thread_launch").run(
      {
        ...launch,
        clientRequestId: "sample-request",
        initialMessage: "Say hello.",
        workspace: { type: "worktree", baseRef: "HEAD" },
      },
      h.context,
    );
    expect(h.threads.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: launchThreadId("alpha", "sample-request"),
        reuseExistingThread: false,
        initialMessage: { text: "Say hello." },
        runtimeMode: "auto-accept-edits",
        workspace: { type: "worktree", baseRef: "HEAD" },
      }),
      h.context.signal,
    );
    expect(launchThreadId("alpha", "sample-request")).toMatch(/^[0-9a-f-]{14}5[0-9a-f-]{21}$/);
    expect(launchThreadId("beta", "sample-request")).not.toBe(
      launchThreadId("alpha", "sample-request"),
    );
    await expect(
      tool("thread_launch").run({ ...launch, runtimeMode: "full-access" }, h.context),
    ).rejects.toThrow("exceeds");
    expect(h.threads.launch).toHaveBeenCalledTimes(1);
  });
  it("resolves Scratch and workspace roots through project facades", async () => {
    const h = harness();
    await tool("thread_launch").run({ scratch: true, modelSelection: model }, h.context);
    await tool("thread_launch").run(
      { workspaceRoot: "/tmp/sample", modelSelection: model },
      h.context,
    );
    expect(h.projects.ensureScratch).toHaveBeenCalledTimes(1);
    expect(h.projects.ensure).toHaveBeenCalledTimes(1);
  });
  it.each(["auto", "queue", "steer", "restart"])(
    "maps send %s directly to library delivery",
    async (mode) => {
      const h = harness();
      expect(
        await tool("thread_send").run({ ...base, text: "Follow up.", mode }, h.context),
      ).toMatchObject({ server: "alpha", messageId: "message-2", mode });
      expect(h.threads.startTurn).toHaveBeenCalledWith(
        expect.objectContaining({ delivery: mode, signal: h.context.signal }),
      );
    },
  );
  it("refuses an inherited runtime mode above the cap without changing the thread", async () => {
    const h = harness({ serverPolicies: { alpha: { maxRuntimeMode: "approval-required" } } });
    await expect(tool("thread_send").run({ ...base, text: "Sample" }, h.context)).rejects.toThrow(
      "exceeds",
    );
    expect(h.threads.startTurn).not.toHaveBeenCalled();
    await tool("thread_send").run(
      { ...base, text: "Sample", runtimeMode: "approval-required" },
      h.context,
    );
    expect(h.threads.startTurn).toHaveBeenCalledTimes(1);
  });
});
describe("controls and request responses", () => {
  it("interrupts active or named runs", async () => {
    const h = harness();
    await tool("thread_interrupt").run({ ...base, runId: "run-1" }, h.context);
    expect(h.threads.interrupt).toHaveBeenCalledWith("thread-1", "run-1", {}, h.context.signal);
  });
  it.each(["rename", "settle", "unsettle", "archive", "unarchive"])(
    "updates %s through its facade",
    async (action) => {
      const h = harness();
      await tool("thread_update").run({ ...base, action, title: "New title" }, h.context);
      if (action === "rename")
        expect(h.threads.update).toHaveBeenCalledWith(
          "thread-1",
          { title: "New title" },
          h.context.signal,
        );
      else expect(h.threads[action as "settle"]).toHaveBeenCalledWith("thread-1", h.context.signal);
    },
  );
  it("requires title to rename and rejects missing threads", async () => {
    const h = harness();
    await expect(
      tool("thread_update").run({ ...base, action: "rename" }, h.context),
    ).rejects.toThrow("requires title");
    h.threads.get.mockResolvedValue(undefined as never);
    await expect(
      tool("thread_update").run({ ...base, action: "archive" }, h.context),
    ).rejects.toThrow("does not exist");
  });
  it("lists requests, answers questions, and keeps approval and question responses separate", async () => {
    const h = harness();
    h.threads.pendingRequests.mockResolvedValue([
      {
        kind: "user-input",
        requestId: "request-1",
        questions: [{ id: "question-1", question: "Choose a value" }],
      },
    ]);
    expect(await tool("pending_request_list").run(base, h.context)).toMatchObject({
      requests: [{ kind: "user-input", requestId: "request-1" }],
    });
    await tool("pending_request_respond").run(
      { ...base, requestId: "request-1", answers: { "question-1": "sample" } },
      h.context,
    );
    expect(h.threads.respondToUserInput).toHaveBeenCalledWith(
      { threadId: "thread-1", requestId: "request-1", answers: { "question-1": "sample" } },
      h.context.signal,
    );
    await expect(
      tool("approval_respond").run(
        { ...base, requestId: "request-1", decision: "accept" },
        h.context,
      ),
    ).rejects.toThrow("pending_request_respond");
    h.threads.pendingRequests.mockResolvedValue([{ kind: "approval", requestId: "request-1" }]);
    await expect(
      tool("pending_request_respond").run(
        { ...base, requestId: "request-1", answers: {} },
        h.context,
      ),
    ).rejects.toThrow("approval_respond");
    await tool("approval_respond").run(
      { ...base, requestId: "request-1", decision: "decline" },
      h.context,
    );
    expect(h.threads.respondToApproval).toHaveBeenCalledWith(
      { threadId: "thread-1", requestId: "request-1", decision: "decline" },
      h.context.signal,
    );
    await expect(
      tool("approval_respond").run({ ...base, requestId: "absent", decision: "accept" }, h.context),
    ).rejects.toThrow("does not exist");
  });
});
it("returns not_found for missing projects before dispatch", async () => {
  const h = harness();
  h.projects.get.mockResolvedValue(undefined as never);
  await expect(tool("thread_launch").run(launch, h.context)).rejects.toMatchObject({
    code: "not_found",
  });
  expect(h.threads.launch).not.toHaveBeenCalled();
});
it("returns not_found for missing threads on every control and send route", async () => {
  const h = harness();
  h.threads.get.mockResolvedValue(undefined);
  const calls = [
    ["thread_send", { text: "Sample" }],
    ["thread_interrupt", {}],
    ["thread_update", { action: "archive" }],
    ["pending_request_list", {}],
    ["pending_request_respond", { requestId: "request-1", answers: {} }],
    ["approval_respond", { requestId: "request-1", decision: "decline" }],
  ] as const;
  for (const [name, args] of calls)
    await expect(tool(name).run({ ...base, ...args }, h.context)).rejects.toMatchObject({
      code: "not_found",
    });
  await expect(
    tool("thread_wait").run({ threads: [base], timeoutMs: 100 }, h.context),
  ).rejects.toMatchObject({ code: "not_found" });
});
