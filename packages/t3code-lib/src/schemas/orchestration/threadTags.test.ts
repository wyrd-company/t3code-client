// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { schemas } from "../../index.ts";
import { OrchestrationV2Command } from "./commands.ts";
import { OrchestrationV2TurnCapabilities } from "./providerCapabilities.ts";
import { OrchestrationV2AppThread } from "./thread.ts";
import { ThreadTag } from "./threadTags.ts";
import { OrchestrationV2TurnItem } from "./turnItems.ts";
import {
  ids,
  makeAppThread,
  makeShellThread,
  makeTurnItem,
  modelSelection,
  parseEvent,
  rawEvent,
} from "../../../test/support/threadFixtures.ts";

const stamped = { commandId: "command-1", threadId: ids.threadId };

describe("ThreadTag", () => {
  it("trims a tag and keeps its case", () => {
    expect(ThreadTag.parse("  Sample Tag ")).toBe("Sample Tag");
    expect(ThreadTag.parse("x".repeat(64))).toHaveLength(64);
  });
  it("rejects an empty, long or multi-line tag", () => {
    for (const tag of ["", "   ", "x".repeat(65), "one\ntwo", "tab\there"]) {
      expect(ThreadTag.safeParse(tag).success, JSON.stringify(tag)).toBe(false);
    }
  });
  it("is exported from the public schemas", () => {
    expect(schemas.orchestrationThreadTags.ThreadTag).toBe(ThreadTag);
  });
});

describe("thread.tag.set", () => {
  it("validates the tag and the flag before sending", () => {
    expect(
      OrchestrationV2Command.parse({
        type: "thread.tag.set",
        ...stamped,
        tag: " sample ",
        tagged: true,
      }),
    ).toEqual({ type: "thread.tag.set", ...stamped, tag: "sample", tagged: true });
    for (const bad of [
      { tag: "sample" },
      { tag: "sample", tagged: "yes" },
      { tag: "", tagged: false },
      { tag: "a\nb", tagged: false },
    ]) {
      expect(
        OrchestrationV2Command.safeParse({ type: "thread.tag.set", ...stamped, ...bad }).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });
});

describe("thread tags on reads", () => {
  it("keeps tags on app and shell threads and leaves omission absent", () => {
    const tagged = OrchestrationV2AppThread.parse(makeAppThread({ tags: ["sample", "Other"] }));
    expect(tagged.tags).toEqual(["sample", "Other"]);
    expect(OrchestrationV2AppThread.parse(makeAppThread()).tags).toBeUndefined();
    expect(makeShellThread({ tags: ["sample"] }).tags).toEqual(["sample"]);
  });
  it("reads malformed stored tags as empty instead of failing the thread", () => {
    expect(OrchestrationV2AppThread.parse(makeAppThread({ tags: "sample" })).tags).toEqual([]);
    expect(makeShellThread({ tags: [1, "sample"] }).tags).toEqual([]);
  });
  it("decodes thread.tags-updated with the whole thread as payload", () => {
    const event = parseEvent(
      rawEvent(1, "thread.tags-updated", makeAppThread({ tags: ["sample"] })),
    );
    expect(event).toMatchObject({ type: "thread.tags-updated", payload: { tags: ["sample"] } });
  });
});

describe("model switch and steering attachments", () => {
  const userMessage = (extra: Record<string, unknown>) =>
    makeTurnItem("user_message", {
      messageId: "message-1",
      createdBy: "user",
      creationSource: "web",
      inputIntent: "turn_start",
      text: "sample",
      attachments: [],
      ...extra,
    });
  it("keeps a user message's model switch", () => {
    const to = { ...modelSelection, model: "sample-model-2" };
    const item = OrchestrationV2TurnItem.parse(
      userMessage({ modelSwitch: { from: modelSelection, to } }),
    );
    expect(item).toMatchObject({ type: "user_message", modelSwitch: { from: modelSelection, to } });
    expect(OrchestrationV2TurnItem.parse(userMessage({}))).not.toHaveProperty("modelSwitch");
    expect(() =>
      OrchestrationV2TurnItem.parse(userMessage({ modelSwitch: { from: modelSelection } })),
    ).toThrow();
    expect(schemas.orchestrationTurnItems.OrchestrationV2ModelSwitch).toBeDefined();
  });
  it("reads activeSteeringAcceptsAttachments as an optional boolean", () => {
    const base = {
      exposesNativeTurnId: true,
      emitsTurnStarted: true,
      emitsTurnCompleted: true,
      supportsInterrupt: true,
      supportsActiveSteering: true,
      supportsSteeringByInterruptRestart: false,
      supportsQueuedMessages: true,
      terminalStatusQuality: "strong",
    };
    expect(
      OrchestrationV2TurnCapabilities.parse({ ...base, activeSteeringAcceptsAttachments: false }),
    ).toMatchObject({ activeSteeringAcceptsAttachments: false });
    expect(OrchestrationV2TurnCapabilities.parse(base)).not.toHaveProperty(
      "activeSteeringAcceptsAttachments",
    );
    expect(
      OrchestrationV2TurnCapabilities.safeParse({ ...base, activeSteeringAcceptsAttachments: "no" })
        .success,
    ).toBe(false);
  });
});
