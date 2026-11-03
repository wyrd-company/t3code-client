import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { T3AuthError, T3DecodeError, T3HttpError, T3RpcDefectError, T3RpcError } from "./errors.ts";
import { SourceControlCloneRepositoryResult } from "./schemas/sourceControl.ts";

const urlWithCredential = "https://sample:sample-password@forge.example.invalid/sample.git";

describe("error payload redaction", () => {
  it("T3DecodeError.raw redacts a clone result that fails to decode", () => {
    const raw = { cwd: 7, remoteUrl: urlWithCredential, repository: null };
    const result = SourceControlCloneRepositoryResult.safeParse(raw);
    if (result.success) throw new Error("Expected a decode failure.");
    const error = new T3DecodeError("sourceControl.cloneRepository", result.error, raw);
    expect(JSON.stringify(error.raw)).not.toContain("sample-password");
  });

  it("T3RpcError redacts a URL in a failure's nested cause", () => {
    const error = new T3RpcError("sourceControl.cloneRepository", {
      _tag: "SourceControlRepositoryError",
      provider: "unknown",
      operation: "cloneRepository",
      detail: "Sample.",
      cause: { command: `git clone ${urlWithCredential}`, args: [urlWithCredential] },
    });
    expect(JSON.stringify(error.detail)).not.toContain("sample-password");
    expect(JSON.stringify(error.record)).not.toContain("sample-password");
    expect(error.record).toMatchObject({ _tag: "SourceControlRepositoryError" });
  });

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
  it("keeps no credential-shaped value of a failure", () => {
    const quoted = { cause: { data: { headers: { "x-sample": "quoted" }, token: "quoted" } } };
    const error = new T3RpcError("server.setAcpRegistryProvider", {
      _tag: "AcpRegistryOperationError",
      reason: "provider_configuration_failed",
      message: "Refused.",
      ...quoted,
    });
    expect(error.is("AcpRegistryOperationError")).toBe(true);
    expect(JSON.stringify([error.detail, error.record])).not.toContain("quoted");
    expect(JSON.stringify(new T3RpcDefectError("server.probe", quoted))).not.toContain("quoted");
  });

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
    expect(error.detail).toEqual(raw);
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
