// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { rpcMethods } from "../rpc/registry.ts";
import { decodeRpcErrorRecord, isRpcErrorOfTag } from "./rpcErrors.ts";

const session = { threadId: "thread-1", providerThreadId: "provider-thread-1", server: "sample" };

describe("MCP sign-in, agent feedback and multi-value secrets (0.1.12)", () => {
  it("starts and completes an MCP server sign-in from a thread", () => {
    const start = rpcMethods["provider.mcpSignIn.start"];
    expect(start.payload.parse(session)).toEqual(session);
    expect(start.payload.safeParse({ ...session, server: "x".repeat(257) }).success).toBe(false);
    const pending = { authorizationUrl: "https://auth.invalid/authorize", signedInAt: null };
    expect(start.success.parse(pending)).toEqual(pending);
    const done = { authorizationUrl: null, signedInAt: "2020-01-01T00:00:00.000Z" };
    expect(start.success.parse(done)).toEqual(done);
    expect(
      start.success.safeParse({ authorizationUrl: "javascript:alert(1)", signedInAt: null })
        .success,
    ).toBe(false);
    const complete = rpcMethods["provider.mcpSignIn.complete"];
    const input = { ...session, callbackUrl: "http://localhost:1/callback?code=sample" };
    expect(complete.payload.parse(input)).toEqual(input);
    expect(complete.payload.safeParse(session).success).toBe(false);
    expect(complete.success.parse({ signedInAt: "2020-01-01T00:00:00.000Z" })).toEqual({
      signedInAt: "2020-01-01T00:00:00.000Z",
    });
    const failure = decodeRpcErrorRecord({
      _tag: "ProviderMcpSignInError",
      server: "sample",
      detail: "The sign-in expired.",
    });
    expect(isRpcErrorOfTag(failure, "ProviderMcpSignInError") && failure.detail).toBe(
      "The sign-in expired.",
    );
  });

  it("sends or declines a feedback report card", () => {
    const answer = rpcMethods["agentFeedback.answerRequest"];
    const input = {
      threadId: "thread-1",
      turnItemId: "item-1",
      answer: "send",
      includeConversation: true,
    };
    expect(answer.payload.parse(input)).toEqual(input);
    expect(answer.payload.safeParse({ ...input, answer: "maybe" }).success).toBe(false);
    expect(answer.success.parse(null)).toBeUndefined();
    for (const reason of ["feedback_off", "newer-reason"]) {
      const failure = decodeRpcErrorRecord({ _tag: "AgentFeedbackRequestError", reason });
      expect(isRpcErrorOfTag(failure, "AgentFeedbackRequestError") && failure.reason).toBe(reason);
    }
  });

  it("answers a multi-value secret card with one value per field", () => {
    const payload = rpcMethods["secrets.answerRequest"].payload;
    const base = { threadId: "thread-1", turnItemId: "item-1" };
    const values = { user: "sample@example.invalid", password: "sample-password" };
    expect(payload.parse({ ...base, answer: { type: "save", values } })).toEqual({
      ...base,
      answer: { type: "save", values },
    });
    expect(payload.parse({ ...base, answer: { type: "save", secret: "sample" } })).toEqual({
      ...base,
      answer: { type: "save", secret: "sample" },
    });
    expect(
      payload.safeParse({ ...base, answer: { type: "save", values: { user: " " } } }).success,
    ).toBe(false);
    expect(payload.safeParse({ ...base, answer: { type: "save" } }).success).toBe(false);
    const failure = decodeRpcErrorRecord({ _tag: "SecretRequestError", reason: "fields_mismatch" });
    expect(isRpcErrorOfTag(failure, "SecretRequestError")).toBe(true);
  });

  it("leaves the reference answer's provider scope to the server", () => {
    const method = rpcMethods["secrets.answerRequest"];
    const reference = method.payload.parse({
      threadId: "thread-1",
      turnItemId: "item-1",
      answer: { type: "reference", reference: { provider: "sample", reference: "sample/token" } },
    });
    expect(method.scope).toBe("orchestration:operate");
    expect(method.payloadScopes?.(reference) ?? []).toEqual([]);
  });
});
