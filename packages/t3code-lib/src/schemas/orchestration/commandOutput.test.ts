// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { schemas } from "../../index.ts";
import type { KnownOr, ThreadId, TurnItemId } from "../common.ts";
import { RpcErrorRecord, decodeRpcErrorRecord, isRpcErrorOfTag } from "../rpcErrors.ts";
import {
  OrchestrationV2CommandOutputFrame,
  OrchestrationV2SubscribeCommandOutputInput,
} from "./commandOutput.ts";

const frame = { kind: "replace", text: "sample\r\n", truncated: false, running: false };

describe("command output schemas", () => {
  it("infers the public input and frame types through the schemas namespace", () => {
    expectTypeOf<schemas.orchestrationCommandOutput.OrchestrationV2CommandOutputFrame>().toEqualTypeOf<OrchestrationV2CommandOutputFrame>();
    expectTypeOf<OrchestrationV2CommandOutputFrame["kind"]>().toEqualTypeOf<
      KnownOr<"replace" | "append">
    >();
    expectTypeOf<OrchestrationV2CommandOutputFrame["text"]>().toEqualTypeOf<string>();
    expectTypeOf<OrchestrationV2CommandOutputFrame["truncated"]>().toEqualTypeOf<boolean>();
    expectTypeOf<OrchestrationV2CommandOutputFrame["running"]>().toEqualTypeOf<boolean>();
    expectTypeOf<
      schemas.orchestrationCommandOutput.OrchestrationV2SubscribeCommandOutputInput["threadId"]
    >().toEqualTypeOf<ThreadId>();
    expectTypeOf<
      OrchestrationV2SubscribeCommandOutputInput["itemId"]
    >().toEqualTypeOf<TurnItemId>();
    expect(schemas.orchestrationCommandOutput.OrchestrationV2CommandOutputFrame).toBe(
      OrchestrationV2CommandOutputFrame,
    );
  });

  it("normalizes both ids and keeps unknown input keys", () => {
    expect(
      OrchestrationV2SubscribeCommandOutputInput.parse({
        threadId: "  thread-1 ",
        itemId: " item-1",
        future: "kept",
      }),
    ).toEqual({ threadId: "thread-1", itemId: "item-1", future: "kept" });
  });

  it("rejects a missing, blank or non-string id while the other stays valid", () => {
    const input = { threadId: "thread-1", itemId: "item-1" };
    for (const key of ["threadId", "itemId"] as const) {
      const { [key]: _omitted, ...rest } = input;
      expect(OrchestrationV2SubscribeCommandOutputInput.safeParse(rest).success, key).toBe(false);
      for (const value of ["", "   ", 42, null]) {
        const wrong = { ...input, [key]: value };
        expect(
          OrchestrationV2SubscribeCommandOutputInput.safeParse(wrong).success,
          `${key}=${String(value)}`,
        ).toBe(false);
      }
    }
  });

  it("decodes replace and append frames and keeps the text unchanged", () => {
    const large = "x".repeat(70_000);
    for (const text of ["", "  padded  ", "\u001b[31mred\u001b[0m\r\n\u001b[2K", large]) {
      for (const kind of ["replace", "append"]) {
        const value = { kind, text, truncated: true, running: true };
        expect(OrchestrationV2CommandOutputFrame.parse(value)).toEqual(value);
      }
    }
  });

  it("keeps a future frame kind and unknown frame fields", () => {
    expect(
      OrchestrationV2CommandOutputFrame.parse({ ...frame, kind: "a-future-kind", next: "kept" }),
    ).toEqual({ ...frame, kind: "a-future-kind", next: "kept" });
  });

  it("rejects each missing frame field while the others stay valid", () => {
    for (const key of Object.keys(frame)) {
      const { [key]: _omitted, ...rest } = frame as Record<string, unknown>;
      expect(OrchestrationV2CommandOutputFrame.safeParse(rest).success, key).toBe(false);
    }
  });

  it("rejects each wrongly typed frame field while the others stay valid", () => {
    const wrong: Record<string, readonly unknown[]> = {
      kind: [1, null, true, {}],
      text: [7, null, false, ["sample"]],
      truncated: ["false", 0, null],
      running: ["false", 1, null],
    };
    for (const [key, values] of Object.entries(wrong)) {
      for (const value of values) {
        const item = { ...frame, [key]: value };
        expect(
          OrchestrationV2CommandOutputFrame.safeParse(item).success,
          `${key}=${String(value)}`,
        ).toBe(false);
      }
    }
  });

  it("decodes the declared command output error with and without a cause", () => {
    for (const extra of [{}, { cause: { name: "Error" } }]) {
      const record = decodeRpcErrorRecord({
        _tag: "OrchestrationV2CommandOutputError",
        threadId: "thread-1",
        message: "",
        ...extra,
      });
      expect(isRpcErrorOfTag(record, "OrchestrationV2CommandOutputError")).toBe(true);
      if (!isRpcErrorOfTag(record, "OrchestrationV2CommandOutputError")) continue;
      expect(record.threadId).toBe("thread-1");
      expect(record.message).toBe("");
      expectTypeOf(record.threadId).toEqualTypeOf<ThreadId>();
      expectTypeOf(record.message).toEqualTypeOf<string>();
    }
  });

  it("keeps a malformed command output error raw", () => {
    for (const raw of [
      { _tag: "OrchestrationV2CommandOutputError", message: "No such command." },
      { _tag: "OrchestrationV2CommandOutputError", threadId: "thread-1" },
      { _tag: "OrchestrationV2CommandOutputError", threadId: " ", message: "No such command." },
      { _tag: "OrchestrationV2CommandOutputError", threadId: "thread-1", message: 7 },
    ]) {
      expect(RpcErrorRecord.safeParse(raw).success, JSON.stringify(raw)).toBe(false);
      expect(decodeRpcErrorRecord(raw)).toEqual({ unknown: true, raw });
    }
  });
});
