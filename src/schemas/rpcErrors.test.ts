import { describe, expect, it } from "vite-plus/test";
import { RpcErrorRecord, decodeRpcErrorRecord, isRpcErrorOfTag } from "./rpcErrors.ts";

describe("RpcErrorRecord", () => {
  it("decodes a known error with its fields", () => {
    const record = decodeRpcErrorRecord({
      _tag: "EnvironmentAuthorizationError",
      message: "Missing scope.",
      requiredScope: "terminal:operate",
    });
    expect(isRpcErrorOfTag(record, "EnvironmentAuthorizationError")).toBe(true);
    if (!isRpcErrorOfTag(record, "EnvironmentAuthorizationError")) return;
    expect(record.requiredScope).toBe("terminal:operate");
  });

  it("uses the wire tag of the keybindings error", () => {
    const record = decodeRpcErrorRecord({
      _tag: "KeybindingsConfigParseError",
      configPath: "/config/keybindings.json",
      detail: "Unexpected token.",
      cause: { name: "SyntaxError", message: "Unexpected token." },
    });
    expect(isRpcErrorOfTag(record, "KeybindingsConfigParseError")).toBe(true);
  });

  it("decodes an unknown tag as the unknown variant", () => {
    const raw = { _tag: "SomeFutureError", reason: "later" };
    expect(decodeRpcErrorRecord(raw)).toEqual({ unknown: true, raw });
  });

  it("keeps a malformed known tag as raw instead of failing", () => {
    const raw = { _tag: "TerminalWriteError", threadId: "thread-1" };
    expect(RpcErrorRecord.safeParse(raw).success).toBe(false);
    expect(decodeRpcErrorRecord(raw)).toEqual({ unknown: true, raw });
  });
});
