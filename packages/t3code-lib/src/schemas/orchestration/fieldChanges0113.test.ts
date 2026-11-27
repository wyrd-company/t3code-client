import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import {
  items,
  makeProjection,
  makeRun,
  parseEvent,
  rawEvent,
} from "../../../test/support/threadFixtures.ts";
import { applyThreadEvent } from "../../api/threadProjection.ts";
import { MentionContextRecord, ReviewCommentContextRecord } from "./messageContext.ts";
import { MessageDispatchCommand } from "./commands/message.ts";
import { OrchestrationV2ProviderThreadNativeMetadata } from "./providerState.ts";
import { OrchestrationV2Run } from "./runs.ts";
import { OrchestrationV2TurnItem } from "./turnItems.ts";

describe("orchestration fields in 0.1.13", () => {
  it("preserves whitespace in mention and review paths", () => {
    const base = { version: 1, contextId: "ctx-1", label: "Example" };
    const mention = { ...base, kind: "mention", path: "notes.txt " };
    const review = {
      ...base,
      kind: "review-comment",
      sectionId: "file:notes.txt ",
      sectionTitle: "Notes",
      filePath: " notes.txt",
      startIndex: 0,
      endIndex: 1,
      rangeLabel: "1",
      text: "",
      diff: "",
    };
    expect(MentionContextRecord.parse(mention)).toEqual(mention);
    expect(ReviewCommentContextRecord.parse(review)).toEqual(review);
    expect(MentionContextRecord.safeParse({ ...mention, path: "" }).success).toBe(false);
    expect(ReviewCommentContextRecord.safeParse({ ...review, filePath: "" }).success).toBe(false);
    expect(ReviewCommentContextRecord.safeParse({ ...review, sectionId: "" }).success).toBe(false);
  });

  it("types the explicit queue command and keeps run markers across lifecycle events", () => {
    const command = {
      type: "message.dispatch",
      commandId: "command-1",
      threadId: "thread-1",
      messageId: "message-1",
      text: "Sample",
      attachments: [],
      createdBy: "user",
      creationSource: "web",
      dispatchMode: { type: "queue_after_active" },
      explicitQueue: true,
    };
    expect(MessageDispatchCommand.parse(command).explicitQueue).toBe(true);
    expect(MessageDispatchCommand.safeParse({ ...command, explicitQueue: false }).success).toBe(
      false,
    );
    const delegatedCompletion = {
      disposition: "open",
      reopenedAfterStop: true,
      nextGeneration: 2,
      delivery: null,
    };
    const queued = makeRun({ status: "queued", explicitQueue: true, delegatedCompletion });
    const projection = applyThreadEvent(
      makeProjection(),
      parseEvent(rawEvent(1, "run.created", queued)),
    );
    const updated = applyThreadEvent(
      projection,
      parseEvent(rawEvent(2, "run.updated", makeRun({ status: "running" }))),
    );
    expect(updated.runs[0]).toMatchObject({
      status: "running",
      explicitQueue: true,
      delegatedCompletion,
    });
    expect(OrchestrationV2Run.safeParse({ ...queued, explicitQueue: false }).success).toBe(false);
    expect(
      OrchestrationV2Run.safeParse({
        ...queued,
        delegatedCompletion: { ...delegatedCompletion, reopenedAfterStop: false },
      }).success,
    ).toBe(false);
  });

  it("types Claude note digests and push hook details on approval rows", () => {
    const claudeDeliveredAppContext = { "note-1": "digest-1" };
    const metadata = OrchestrationV2ProviderThreadNativeMetadata.parse({
      claudeDeliveredAppContext,
    });
    expectTypeOf(metadata.claudeDeliveredAppContext).toEqualTypeOf<
      Record<string, string> | undefined
    >();
    expect(metadata.claudeDeliveredAppContext).toEqual(claudeDeliveredAppContext);
    expect(
      OrchestrationV2ProviderThreadNativeMetadata.safeParse({
        claudeDeliveredAppContext: { "note-1": 42 },
      }).success,
    ).toBe(false);
    const pushHooks = {
      branch: "sample-branch",
      files: [".githooks/pre-push"],
      commands: [{ name: "pre-push", command: "sample-check" }],
    };
    const item = OrchestrationV2TurnItem.parse(items.approvalRequest("request-1", { pushHooks }));
    if ("unknown" in item || item.type !== "approval_request")
      throw new Error("Expected an approval.");
    expectTypeOf(item.pushHooks?.commands[0]?.name).toEqualTypeOf<string | undefined>();
    expect(item.pushHooks).toEqual(pushHooks);
    expect(
      OrchestrationV2TurnItem.safeParse(
        items.approvalRequest("request-1", {
          pushHooks: { ...pushHooks, commands: ["sample-check"] },
        }),
      ).success,
    ).toBe(false);
  });
});
