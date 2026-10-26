// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { TerminalApi } from "../index.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { RpcPayload } from "../rpc/spec.ts";
import { TerminalAttachInput } from "./terminal.ts";

const input = { threadId: "thread-sample", terminalId: "term-1" };

describe("optional terminal attach resume", () => {
  it("exposes an optional boolean through schema, registry and public facade", () => {
    expectTypeOf<TerminalAttachInput["resume"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<RpcPayload<RpcMethods, "terminal.attach">["resume"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<Parameters<TerminalApi["attach"]>[0]["resume"]>().toEqualTypeOf<
      boolean | undefined
    >();
  });

  it("preserves omission, booleans and future fields", () => {
    for (const value of [
      input,
      { ...input, resume: true },
      { ...input, resume: false, future: 1 },
    ]) {
      expect(TerminalAttachInput.parse(value)).toEqual(value);
    }
  });

  it("rejects malformed resume values in otherwise valid attach inputs", () => {
    for (const resume of [null, 0, 1, "true", {}, []]) {
      expect(TerminalAttachInput.safeParse({ ...input, resume }).success).toBe(false);
    }
  });
});
