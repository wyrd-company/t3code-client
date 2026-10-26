// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { makeTurnItem, makeProjection, eventItem } from "../../test/support/threadFixtures.ts";
import type { ThreadsApi } from "../api/threads.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";
import {
  OrchestrationV2TurnItem,
  OrchestrationV2ProjectedTurnItems,
  type OrchestrationV2TurnItemOfType,
} from "./orchestration/turnItems.ts";
import { OrchestrationV2ThreadProjection } from "./orchestration/projection.ts";
import { OrchestrationV2ThreadStreamItem } from "./orchestration/stream.ts";

function userItem(metadata: Record<string, unknown> = {}) {
  return makeTurnItem("user_message", {
    createdBy: "user",
    creationSource: "web",
    messageId: "message-sample",
    inputIntent: "turn_start",
    text: "Sample text",
    attachments: [],
    ...metadata,
  });
}

describe("optional user-message turn-item workflow-script metadata", () => {
  it("exposes optional boolean through the message, registry and public projection", () => {
    type Public = Awaited<ReturnType<ThreadsApi["projection"]>>;
    type Rpc = RpcSuccess<RpcMethods, "orchestration.getThreadProjection">;
    expectTypeOf<OrchestrationV2TurnItemOfType<"user_message">["workflowScript"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<
      Extract<Public["turnItems"][number], { type: "user_message" }>["workflowScript"]
    >().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<
      Extract<Rpc["turnItems"][number], { type: "user_message" }>["workflowScript"]
    >().toEqualTypeOf<boolean | undefined>();
  });

  it("preserves true, false, omission and unknown metadata in projections and events", () => {
    for (const metadata of [{}, { workflowScript: true }, { workflowScript: false }]) {
      const message = userItem({ ...metadata, future: "preserved" });
      const decoded = OrchestrationV2TurnItem.parse(message);
      expect(decoded).toEqual(message);
      expect(Object.hasOwn(decoded, "workflowScript")).toBe(
        Object.hasOwn(metadata, "workflowScript"),
      );
      expect(
        OrchestrationV2ThreadProjection.parse({ ...makeProjection(), turnItems: [message] })
          .turnItems[0],
      ).toEqual(message);
      expect(
        OrchestrationV2ProjectedTurnItems.parse([
          {
            position: 0,
            visibility: "local",
            sourceThreadId: "thread-sample",
            sourceItemId: "item-sample",
            item: message,
          },
        ])[0]?.item,
      ).toEqual(message);
      expect(
        OrchestrationV2ThreadStreamItem.parse(eventItem(1, "turn-item.updated", message)),
      ).toMatchObject({ kind: "event", event: { type: "turn-item.updated", payload: message } });
    }
  });

  it("rejects malformed workflow-script metadata on an otherwise valid user-message turn item", () => {
    expect(OrchestrationV2TurnItem.safeParse(userItem()).success).toBe(true);
    for (const workflowScript of [null, 0, 1, "true", "false", [], {}]) {
      const message = userItem({ workflowScript });
      expect(OrchestrationV2TurnItem.safeParse(message).success).toBe(false);
      expect(
        OrchestrationV2ThreadProjection.safeParse({ ...makeProjection(), turnItems: [message] })
          .success,
      ).toBe(false);
      expect(
        OrchestrationV2ThreadStreamItem.safeParse(eventItem(1, "turn-item.updated", message))
          .success,
      ).toBe(false);
    }
  });
});
