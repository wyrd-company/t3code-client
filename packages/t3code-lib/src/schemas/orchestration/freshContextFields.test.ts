// ---
// relationships:
//   verifies: library
// ---
/** The 0.1.8 orchestration field changes: fresh context, settle guard, shell fallback and more. */
import { describe, expect, it } from "vite-plus/test";
import { makeAppThread, makeRun, makeTurnItem } from "../../../test/support/threadFixtures.ts";
import { OrchestrationV2Command } from "./commands.ts";
import { OrchestrationV2ProviderSession, OrchestrationV2ProviderTurn } from "./providerState.ts";
import { OrchestrationV2Run } from "./runs.ts";
import { OrchestrationV2ShellStreamItem, OrchestrationV2SubscribeShellInput } from "./shell.ts";
import { OrchestrationV2AppThread, isDelegatedAppThread } from "./thread.ts";
import { OrchestrationV2RemoteTaskChild } from "./threadLink.ts";
import { OrchestrationV2TurnItem } from "./turnItems.ts";

const dispatch = {
  type: "message.dispatch",
  commandId: "command-1",
  threadId: "thread-1",
  createdBy: "user",
  creationSource: "web",
  messageId: "message-1",
  text: "Start again.",
  attachments: [],
  dispatchMode: { type: "queue_after_active" },
};

describe("fresh context", () => {
  it("reads freshContext and usageLimitContinuationOfRunId on a run", () => {
    const run = OrchestrationV2Run.parse(
      makeRun({ freshContext: true, usageLimitContinuationOfRunId: "run-0" }),
    );
    expect(run.freshContext).toBe(true);
    expect(run.usageLimitContinuationOfRunId).toBe("run-0");
    expect(OrchestrationV2Run.parse(makeRun()).freshContext).toBeUndefined();
    expect(OrchestrationV2Run.safeParse(makeRun({ freshContext: "yes" })).success).toBe(false);
  });

  it("sends freshContext on message.dispatch and reads it on the user message", () => {
    const command = OrchestrationV2Command.parse({ ...dispatch, freshContext: true });
    expect(command).toMatchObject({ type: "message.dispatch", freshContext: true });
    expect(OrchestrationV2Command.safeParse({ ...dispatch, freshContext: 1 }).success).toBe(false);
    const item = OrchestrationV2TurnItem.parse(
      makeTurnItem("user_message", {
        createdBy: "user",
        creationSource: "web",
        messageId: "message-1",
        inputIntent: "message",
        text: "Start again.",
        attachments: [],
        freshContext: true,
      }),
    );
    expect(item).toMatchObject({ type: "user_message", freshContext: true });
  });
});

describe("thread.settle", () => {
  it("sends expectedLatestRunId", () => {
    const settle = { type: "thread.settle", commandId: "command-1", threadId: "thread-1" };
    expect(OrchestrationV2Command.parse({ ...settle, expectedLatestRunId: "run-1" })).toEqual({
      ...settle,
      expectedLatestRunId: "run-1",
    });
    expect(OrchestrationV2Command.safeParse({ ...settle, expectedLatestRunId: "" }).success).toBe(
      false,
    );
  });
});

describe("shell resume fallback", () => {
  it("sends httpSnapshotFallback only as true and reads snapshot-required", () => {
    expect(
      OrchestrationV2SubscribeShellInput.parse({ afterSequence: 4, httpSnapshotFallback: true }),
    ).toEqual({ afterSequence: 4, httpSnapshotFallback: true });
    expect(
      OrchestrationV2SubscribeShellInput.safeParse({ httpSnapshotFallback: false }).success,
    ).toBe(false);
    expect(OrchestrationV2ShellStreamItem.parse({ kind: "snapshot-required" })).toEqual({
      kind: "snapshot-required",
    });
  });
});

describe("provider session and turn", () => {
  it("reads extensionStatuses with an empty default and the upstream bounds", () => {
    const field = OrchestrationV2ProviderSession.shape.extensionStatuses;
    expect(field.parse(undefined)).toEqual([]);
    expect(field.parse([{ key: "sample", text: "Ready" }])).toEqual([
      { key: "sample", text: "Ready" },
    ]);
    for (const value of [
      [{ key: "", text: "Ready" }],
      [{ key: "k".repeat(257), text: "Ready" }],
      [{ key: "sample", text: " " }],
      [{ key: "sample", text: "t".repeat(4097) }],
      Array.from({ length: 33 }, (_, index) => ({ key: `k${index}`, text: "Ready" })),
    ]) {
      expect(field.safeParse(value).success).toBe(false);
    }
  });

  it("reads the model a provider turn reported", () => {
    const field = OrchestrationV2ProviderTurn.shape.model;
    expect(field.parse(undefined)).toBeUndefined();
    expect(field.parse("sample-model")).toBe("sample-model");
    expect(field.safeParse(" ").success).toBe(false);
  });
});

describe("delegation", () => {
  it("reads the title of a remote task child", () => {
    const child = { environmentId: "environment-1", threadId: "thread-2", label: "Sample" };
    expect(OrchestrationV2RemoteTaskChild.parse({ ...child, title: "Task" }).title).toBe("Task");
    expect(OrchestrationV2RemoteTaskChild.parse(child).title).toBeUndefined();
  });

  it("names subagents and delegated threads as delegated", () => {
    const local = OrchestrationV2AppThread.parse(makeAppThread());
    expect(isDelegatedAppThread(local)).toBe(false);
    const subagent = OrchestrationV2AppThread.parse(
      makeAppThread({
        lineage: {
          parentThreadId: "thread-0",
          relationshipToParent: "subagent",
          rootThreadId: "thread-0",
        },
      }),
    );
    expect(isDelegatedAppThread(subagent)).toBe(true);
    const delegated = OrchestrationV2AppThread.parse(
      makeAppThread({
        delegatedFrom: { environmentId: "environment-1", threadId: "thread-9", title: "Origin" },
      }),
    );
    expect(isDelegatedAppThread(delegated)).toBe(true);
  });
});

describe("secret request", () => {
  it("reads the url of a secret request item", () => {
    const item = OrchestrationV2TurnItem.parse(
      makeTurnItem("secret_request", {
        label: "Sample key",
        reason: "Needed to call the sample service.",
        url: "https://keys.example.invalid",
        secretStatus: "pending",
      }),
    );
    expect(item).toMatchObject({ type: "secret_request", url: "https://keys.example.invalid" });
  });
});
