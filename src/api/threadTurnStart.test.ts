import { describe, expect, it } from "vite-plus/test";
import { ids } from "../../test/support/threadFixtures.ts";
import { commandId, messageId } from "../schemas/common.ts";
import type { OrchestrationV2Command } from "../schemas/orchestration/commands.ts";
import {
  creationFields,
  deliveryFields,
  startThreadTurn,
  type TurnStartDependencies,
} from "./threadTurnStart.ts";

function makeDeps(): TurnStartDependencies & { readonly dispatched: OrchestrationV2Command[] } {
  const dispatched: OrchestrationV2Command[] = [];
  let counter = 0;
  return {
    dispatched,
    dispatch: async (command) => {
      dispatched.push(command);
      return { sequence: 10 + dispatched.length };
    },
    // Never iterated here: the handle starts its watch lazily.
    watch: () => ({ [Symbol.asyncIterator]: async function* () {} }),
    interrupt: async () => undefined,
    newCommandId: () => commandId(`command-${++counter}`),
    newMessageId: () => messageId(`message-${++counter}`),
  };
}

describe("creationFields", () => {
  it("defaults to a user from the web and keeps what the caller names", () => {
    expect(creationFields(undefined)).toEqual({ createdBy: "user", creationSource: "web" });
    expect(creationFields({ createdBy: "agent" })).toEqual({
      createdBy: "agent",
      creationSource: "web",
    });
    expect(creationFields({ creationSource: "mcp" })).toEqual({
      createdBy: "user",
      creationSource: "mcp",
    });
  });
});

describe("deliveryFields", () => {
  it.each([
    ["auto", { dispatchMode: { type: "start_immediately" }, deliveryIntent: "auto" }],
    ["steer", { dispatchMode: { type: "start_immediately" }, deliveryIntent: "steer" }],
    ["restart", { dispatchMode: { type: "start_immediately" }, deliveryIntent: "restart" }],
    ["queue", { dispatchMode: { type: "queue_after_active" } }],
    ["start", { dispatchMode: { type: "start_immediately" } }],
  ] as const)("%s", (delivery, expected) => {
    expect(deliveryFields(delivery)).toEqual(expected);
  });
});

describe("startThreadTurn", () => {
  it("dispatches message.dispatch with defaults and returns a handle from the receipt", async () => {
    const deps = makeDeps();
    const handle = await startThreadTurn(deps, { threadId: ids.threadId, text: "Say pong." });
    expect(deps.dispatched).toEqual([
      {
        type: "message.dispatch",
        createdBy: "user",
        creationSource: "web",
        commandId: "command-1",
        threadId: ids.threadId,
        messageId: "message-2",
        text: "Say pong.",
        attachments: [],
        dispatchMode: { type: "start_immediately" },
        deliveryIntent: "auto",
      },
    ]);
    expect(handle).toMatchObject({
      threadId: ids.threadId,
      messageId: "message-2",
      commandId: "command-1",
      sequence: 11,
      runId: undefined,
    });
  });

  it("sets the thread's modes first when the caller names them", async () => {
    const deps = makeDeps();
    await startThreadTurn(deps, {
      threadId: ids.threadId,
      text: "Plan it.",
      runtimeMode: "approval-required",
      interactionMode: "plan",
    });
    expect(deps.dispatched.map((c) => c.type)).toEqual([
      "thread.runtime-mode.set",
      "thread.interaction-mode.set",
      "message.dispatch",
    ]);
    expect(deps.dispatched[0]).toMatchObject({
      runtimeMode: "approval-required",
      commandId: "command-1",
    });
    expect(deps.dispatched[1]).toMatchObject({ interactionMode: "plan", commandId: "command-2" });
    expect(deps.dispatched[2]).toMatchObject({ commandId: "command-3", messageId: "message-4" });
  });

  it("passes the optional message fields and the delivery choice through", async () => {
    const deps = makeDeps();
    const modelSelection = { instanceId: "sample-provider" as never, model: "sample-model" };
    await startThreadTurn(deps, {
      threadId: ids.threadId,
      text: "Queue me.",
      delivery: "queue",
      modelSelection,
      titleSeed: "Queued work",
      origin: { createdBy: "agent", creationSource: "mcp" },
    });
    expect(deps.dispatched[0]).toMatchObject({
      createdBy: "agent",
      creationSource: "mcp",
      modelSelection,
      titleSeed: "Queued work",
      dispatchMode: { type: "queue_after_active" },
    });
    expect(deps.dispatched[0]).not.toHaveProperty("deliveryIntent");
    expect(deps.dispatched[0]).not.toHaveProperty("context");
  });

  it("stops at the first dispatch that fails", async () => {
    const deps = makeDeps();
    deps.dispatch = async () => {
      throw new Error("rejected");
    };
    await expect(
      startThreadTurn(deps, { threadId: ids.threadId, text: "x", runtimeMode: "auto" }),
    ).rejects.toThrow("rejected");
    expect(deps.dispatched).toEqual([]);
  });
});
