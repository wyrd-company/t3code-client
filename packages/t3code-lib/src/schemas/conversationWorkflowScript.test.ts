// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { makeMessage, makeProjection, eventItem } from "../../test/support/threadFixtures.ts";
import type { ThreadsApi } from "../api/threads.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcSuccess } from "../rpc/spec.ts";
import { OrchestrationV2ConversationMessage } from "./orchestration/messages.ts";
import { OrchestrationV2ThreadProjection } from "./orchestration/projection.ts";
import { OrchestrationV2ThreadStreamItem } from "./orchestration/stream.ts";

describe("optional conversation workflow-script metadata", () => {
  it("exposes optional boolean through the message, registry and public projection", () => {
    type Public = Awaited<ReturnType<ThreadsApi["projection"]>>;
    type Rpc = RpcSuccess<RpcMethods, "orchestration.getThreadProjection">;
    expectTypeOf<OrchestrationV2ConversationMessage["workflowScript"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<Public["messages"][number]["workflowScript"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<Rpc["messages"][number]["workflowScript"]>().toEqualTypeOf<boolean | undefined>();
  });

  it("preserves true, false, omission and unknown metadata in projections and events", () => {
    for (const metadata of [{}, { workflowScript: true }, { workflowScript: false }]) {
      const message = makeMessage({ ...metadata, future: "preserved" });
      const decoded = OrchestrationV2ConversationMessage.parse(message);
      expect(decoded).toEqual(message);
      expect(Object.hasOwn(decoded, "workflowScript")).toBe(
        Object.hasOwn(metadata, "workflowScript"),
      );
      expect(
        OrchestrationV2ThreadProjection.parse({ ...makeProjection(), messages: [message] })
          .messages[0],
      ).toEqual(message);
      expect(
        OrchestrationV2ThreadStreamItem.parse(eventItem(1, "message.updated", message)),
      ).toMatchObject({ kind: "event", event: { type: "message.updated", payload: message } });
    }
  });

  it("rejects malformed workflow-script metadata on an otherwise valid conversation message", () => {
    expect(OrchestrationV2ConversationMessage.safeParse(makeMessage()).success).toBe(true);
    for (const workflowScript of [null, 0, 1, "true", "false", [], {}]) {
      const message = makeMessage({ workflowScript });
      expect(OrchestrationV2ConversationMessage.safeParse(message).success).toBe(false);
      expect(
        OrchestrationV2ThreadProjection.safeParse({ ...makeProjection(), messages: [message] })
          .success,
      ).toBe(false);
      expect(
        OrchestrationV2ThreadStreamItem.safeParse(eventItem(1, "message.updated", message)).success,
      ).toBe(false);
    }
  });
});
