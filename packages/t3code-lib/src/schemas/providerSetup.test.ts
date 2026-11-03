// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, it } from "vite-plus/test";
import { rpcMethods } from "../rpc/registry.ts";
import {
  ChatGptHandoffInput,
  ChatGptHandoffState,
  ChatGptImportProfileInput,
  ChatGptTransferredProfile,
  ProviderAuthRespondInput,
  ProviderAuthStartInput,
  ProviderAuthState,
  ProviderConsumeResetCreditInput,
  ProviderConsumeResetCreditResult,
} from "./providerSetup.ts";
import { decodeRpcErrorRecord } from "./rpcErrors.ts";

const state = {
  instanceId: "generic",
  phase: "waiting",
  flowId: "flow",
  authorizationUrl: null,
  expiresAt: null,
  message: null,
};

const profile = {
  registration: { clientId: "oaiapp_generic" },
  credentials: {
    clientId: "oaiapp_generic",
    accessToken: "access",
    refreshToken: null,
    idToken: "identity",
    issuer: "https://example.invalid",
    expiresAt: 1,
    earliestRefreshAt: null,
    scopes: ["openid"],
    subject: "subject",
    email: null,
  },
};

const respond = { instanceId: "generic", flowId: "flow", interactionId: "step" };

describe("provider sign-in inputs", () => {
  it("takes only the callback modes the server knows", () => {
    expect(ProviderAuthStartInput.safeParse({ instanceId: "generic" }).success).toBe(true);
    expect(
      ProviderAuthStartInput.safeParse({ instanceId: "generic", callbackMode: "client" }).success,
    ).toBe(true);
    expect(
      ProviderAuthStartInput.safeParse({ instanceId: "generic", callbackMode: "other" }).success,
    ).toBe(false);
  });

  it("takes a response of a known kind, within the contract's bounds", () => {
    for (const response of [
      { type: "browser", action: "accept" },
      { type: "terminal", data: "y\n", size: { cols: 80, rows: 24 } },
      { type: "credentials", values: { field: "value" } },
    ]) {
      expect(ProviderAuthRespondInput.safeParse({ ...respond, response }).success).toBe(true);
    }
    const tooMany = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`f${i}`, "value"]));
    for (const response of [
      { type: "browser", action: "maybe" },
      { type: "terminal", data: "x".repeat(4_097) },
      { type: "terminal", data: "", size: { cols: 501, rows: 24 } },
      { type: "credentials", values: tooMany },
      { type: "deviceCode" },
    ]) {
      expect(ProviderAuthRespondInput.safeParse({ ...respond, response }).success).toBe(false);
    }
  });

  it("keeps the contract's rules on a profile a caller sends", () => {
    const input = { instanceId: "generic", profile };
    expect(ChatGptImportProfileInput.safeParse(input).success).toBe(true);
    expect(
      ChatGptImportProfileInput.safeParse({
        instanceId: "generic",
        profile: { ...profile, registration: { clientId: "other" } },
      }).success,
    ).toBe(false);
    expect(
      ChatGptImportProfileInput.safeParse({
        instanceId: "generic",
        profile: { ...profile, credentials: { ...profile.credentials, accessToken: "" } },
      }).success,
    ).toBe(false);
    const handoff = {
      instanceId: "generic",
      environmentId: "environment",
      attemptId: "attempt",
      returnUrl: "http://127.0.0.1:1/return",
      profile: null,
    };
    expect(ChatGptHandoffInput.safeParse(handoff).success).toBe(true);
    expect(
      ChatGptHandoffInput.safeParse({
        ...handoff,
        profile: {
          clientId: "oaiapp_generic",
          redirectUri: "https://example.invalid/auth/callback",
        },
      }).success,
    ).toBe(false);
  });

  it("takes a reset credit of an instance or of a source's account", () => {
    expect(ProviderConsumeResetCreditInput.safeParse({ instanceId: "generic" }).success).toBe(true);
    expect(
      ProviderConsumeResetCreditInput.safeParse({
        sourceId: "source",
        accountId: "account",
        creditId: "credit",
      }).success,
    ).toBe(true);
    expect(ProviderConsumeResetCreditInput.safeParse({ sourceId: "source" }).success).toBe(false);
  });

  it("lets the profile of a finished handoff go to an import", () => {
    const finished = ChatGptTransferredProfile.parse(profile);
    const input: ChatGptImportProfileInput = { instanceId: "generic" as never, profile: finished };
    expect(ChatGptImportProfileInput.parse(input).profile.credentials.accessToken).toBe("access");
  });
});

describe("provider sign-in results", () => {
  it("decodes each kind of interaction, and one from a newer server", () => {
    for (const interaction of [
      {
        type: "browser",
        id: "a",
        url: "https://example.invalid",
        requiresConsent: true,
      },
      { type: "deviceCode", id: "a", url: "https://example.invalid", userCode: "CODE" },
      { type: "terminal", id: "a", output: "", outputOffset: 0 },
      { type: "credentials", id: "a", fields: [{ name: "key", label: "Key", secret: true }] },
    ]) {
      expect(ProviderAuthState.parse({ ...state, interaction }).interaction).toMatchObject(
        interaction,
      );
    }
    expect(
      ProviderAuthState.parse({ ...state, interaction: { type: "later", id: "a" } }).interaction,
    ).toMatchObject({ unknown: true });
    expect(ProviderAuthState.parse({ ...state, interaction: null }).interaction).toBeNull();
    expect(
      ProviderAuthState.safeParse({ ...state, interaction: { type: "browser", id: "a" } }).success,
    ).toBe(false);
  });

  it("keeps a newer server's phase, credential owner and method, and drops a broken method", () => {
    const decoded = ProviderAuthState.parse({
      ...state,
      phase: "later",
      credentialOwner: "later",
      methods: [
        { id: "a", name: "A", description: null, type: "later" },
        { id: "b", name: "B", description: null },
      ],
    });
    expect(decoded.phase).toBe("later");
    expect(decoded.credentialOwner).toBe("later");
    expect(decoded.methods?.map((method) => method.id)).toEqual(["a"]);
  });

  it("decodes a handoff's states", () => {
    expect(ChatGptHandoffState.parse({ phase: "auth", state })).toMatchObject({ phase: "auth" });
    expect(ChatGptHandoffState.parse({ phase: "finished", profile })).toMatchObject({
      phase: "finished",
    });
    expect(ChatGptHandoffState.parse({ phase: "later" })).toMatchObject({ unknown: true });
  });

  it("keeps a newer server's reset credit outcome", () => {
    expect(ProviderConsumeResetCreditResult.parse({ outcome: "later" }).outcome).toBe("later");
    expect(
      ProviderConsumeResetCreditResult.parse({ outcome: "reset", warning: "note" }).warning,
    ).toBe("note");
  });

  it("decodes the methods' failures", () => {
    expect(decodeRpcErrorRecord({ _tag: "UsageLimitSourceError", detail: "x" })).toEqual({
      _tag: "UsageLimitSourceError",
      detail: "x",
    });
    expect(decodeRpcErrorRecord({ _tag: "ProviderUploadFeedbackError", threadId: "t" })).toEqual({
      _tag: "ProviderUploadFeedbackError",
      threadId: "t",
    });
  });

  it("reads a nullable reconnect profile", () => {
    const { success } = rpcMethods["provider.chatgpt.reconnect-profile"];
    expect(success.parse(null)).toBeNull();
    expect(success.parse({ clientId: "oaiapp_generic", later: 1 })).toMatchObject({ later: 1 });
  });
});
