import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { T3AuthError, T3DecodeError, T3HttpError, T3RpcError } from "./errors.ts";

describe("error payload redaction", () => {
  it("T3DecodeError.raw does not carry credentials from a badly shaped token response", () => {
    const raw = { access_token: "secret-1", scope: "orchestration:read", expires_in: "soon" };
    const result = z.looseObject({ expires_in: z.number() }).safeParse(raw);
    if (result.success) throw new Error("expected a decode failure");
    const error = new T3DecodeError("POST /oauth/token", result.error, raw);
    expect(error.raw).toEqual({
      access_token: "[redacted]",
      scope: "orchestration:read",
      expires_in: "soon",
    });
    expect(raw.access_token).toBe("secret-1");
    expect(error.message).not.toContain("secret-1");
  });

  it("T3HttpError.body and its subclasses redact credential-shaped fields", () => {
    const details = {
      status: 400,
      method: "POST",
      path: "/oauth/token",
      body: { error: "invalid_grant", subject_token: "pairing-1", nested: { ticket: "t-1" } },
    };
    expect(new T3HttpError("failed", details).body).toEqual({
      error: "invalid_grant",
      subject_token: "[redacted]",
      nested: { ticket: "[redacted]" },
    });
    expect(new T3AuthError("failed", { ...details, code: "auth_invalid" }).body).toMatchObject({
      subject_token: "[redacted]",
    });
    expect(new T3HttpError("failed", { ...details, body: "plain text" }).body).toBe("plain text");
  });
});

describe("T3RpcError", () => {
  it("decodes a known tagged failure into a typed record", () => {
    const error = new T3RpcError("terminal.write", {
      _tag: "TerminalNotRunningError",
      threadId: "thread-1",
      terminalId: "terminal-1",
    });
    expect(error.tag).toBe("TerminalNotRunningError");
    expect(error.is("TerminalNotRunningError")).toBe(true);
    expect(error.is("TerminalWriteError")).toBe(false);
    if (!error.is("TerminalNotRunningError")) throw new Error("expected a known record");
    expect(error.record.terminalId).toBe("terminal-1");
    expect(error.message).toBe("terminal.write failed: TerminalNotRunningError");
  });

  it("uses detail for the message when the record has no message field", () => {
    const error = new T3RpcError("vcs.listRefs", {
      _tag: "GitCommandError",
      operation: "listRefs",
      command: "git branch",
      cwd: "/work/sample",
      detail: "not a repository",
    });
    expect(error.is("GitCommandError")).toBe(true);
    expect(error.message).toBe("vcs.listRefs failed: not a repository");
  });

  it("keeps an unknown tag as the unknown variant", () => {
    const raw = { _tag: "SomeFutureError", message: "later" };
    const error = new T3RpcError("server.probe", raw);
    expect(error.record).toEqual({ unknown: true, raw });
    expect(error.tag).toBe("SomeFutureError");
    expect(error.detail).toBe(raw);
    expect(error.message).toBe("server.probe failed: later");
  });

  it("keeps a known tag with a mismatched shape as raw without throwing", () => {
    const raw = { _tag: "EnvironmentAuthorizationError", message: 42 };
    const error = new T3RpcError("server.probe", raw);
    expect(error.record).toEqual({ unknown: true, raw });
    expect(error.is("EnvironmentAuthorizationError")).toBe(false);
    expect(error.tag).toBe("EnvironmentAuthorizationError");
    expect(error.message).toBe("server.probe failed: EnvironmentAuthorizationError");
  });
});
