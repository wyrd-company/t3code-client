// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The provider sign-in methods on an owned stock server with its own `HOME`, so
 * no method can reach a login of this machine. A managed Codex instance keeps its
 * connection in that server's home. The tests never open a sign-in URL, so no
 * sign-in happens. Starting a flow reads the provider's public sign-in metadata.
 */
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { T3Client } from "../../src/index.ts";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  isUnknownVariant,
} from "../../src/schemas/common.ts";
import type { ProviderAuthState } from "../../src/schemas/providerSetup.ts";
import { firstItem, hasLiveServer, refusal } from "./liveClient.ts";
import { startPeerServer, type PeerServer } from "./peerServer.ts";

const managed = ProviderInstanceId.parse("signin");
const unsupported = ProviderInstanceId.parse("codex");
const missing = ProviderInstanceId.parse("absent");
/** With no route to the provider's public metadata, a flow ends here. */
const metadataUnreachable = /Could not reach ChatGPT sign-in/;

/** The first state of the instance's stream that `accept` keeps. */
const nextState = (
  client: T3Client,
  instanceId: ProviderInstanceId,
  accept: (state: ProviderAuthState) => boolean,
): Promise<ProviderAuthState> =>
  firstItem(client.rpc.stream("provider.auth.subscribe", { instanceId }), (state) =>
    accept(state) ? state : undefined,
  );

/** A profile whose client ids differ, so that the server refuses it before any other check. */
const mismatchedProfile = {
  registration: { clientId: "oaiapp_generic" },
  credentials: {
    clientId: "oaiapp_other",
    accessToken: "generic-access",
    refreshToken: null,
    idToken: "generic-identity",
    issuer: "https://example.invalid",
    expiresAt: 1,
    earliestRefreshAt: null,
    scopes: [],
    subject: "generic-subject",
    email: null,
  },
};

describe.skipIf(!hasLiveServer)("provider sign-in methods", () => {
  let peer: PeerServer;
  let client: T3Client;
  let home: string;
  beforeAll(async () => {
    home = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-lib-provider-auth-"));
    peer = await startPeerServer({
      environment: { HOME: home, CODEX_HOME: NodePath.join(home, ".codex") },
    });
    client = peer.client;
    await client.rpc.call("server.updateSettings", {
      patch: {
        providerInstances: {
          [managed]: {
            driver: ProviderDriverKind.parse("codex"),
            displayName: "Managed sign-in",
            config: { setupMode: "managed" },
          },
        },
      },
    });
  }, 120_000);
  afterAll(async () => {
    await peer?.stop();
    if (home) await NodeFSP.rm(home, { recursive: true, force: true });
  });

  it("reports the state of a managed instance, and of an instance with no sign-in", async () => {
    const state = await nextState(client, managed, () => true);
    expect(state).toMatchObject({
      instanceId: managed,
      phase: "idle",
      flowId: null,
      credentialOwner: "t3",
    });
    expect(state.methods?.map((method) => method.id)).toContain("chatgpt");

    expect(
      await refusal(client.rpc.call("provider.auth.start", { instanceId: unsupported })),
    ).toMatchObject({ _tag: "ProviderSetupError", operation: "start" });
    expect(
      await refusal(client.rpc.call("provider.auth.logout", { instanceId: missing })),
    ).toMatchObject({ _tag: "ProviderSetupError", instanceId: missing, operation: "logout" });
  });

  it("signs out with no saved connection", async () => {
    const state = await client.rpc.call("provider.auth.logout", { instanceId: managed });
    expect(state).toMatchObject({ phase: "idle", message: "Signed out." });
  });

  it("starts a sign-in, refuses a foreign callback and cancels", async () => {
    const started = await client.rpc.call("provider.auth.start", { instanceId: managed });
    expect(started.phase).toBe("starting");
    const flowId = started.flowId ?? "";
    const waiting = await nextState(client, managed, (state) =>
      ["waiting", "failed"].includes(state.phase),
    );
    if (waiting.phase === "failed") {
      expect(waiting.message).toMatch(metadataUnreachable);
      return;
    }
    expect(waiting.flowId).toBe(flowId);
    expect(waiting.interaction).toMatchObject({
      type: "browser",
      id: flowId,
      acceptsCallback: true,
    });

    expect(
      await refusal(
        client.rpc.call("provider.auth.complete", {
          instanceId: managed,
          flowId,
          callbackUrl: "http://127.0.0.1:1/auth/callback?state=generic&code=generic",
        }),
      ),
    ).toMatchObject({ _tag: "ProviderSetupError", operation: "complete" });
    expect(
      await refusal(
        client.rpc.call("provider.auth.respond", {
          instanceId: managed,
          flowId,
          interactionId: flowId,
          response: { type: "browser", action: "decline" },
        }),
      ),
    ).toMatchObject({ _tag: "ProviderSetupError", operation: "respond" });

    const cancelled = await client.rpc.call("provider.auth.cancel", {
      instanceId: managed,
      flowId,
    });
    expect(cancelled).toMatchObject({ phase: "cancelled", flowId, interaction: null });
  }, 60_000);

  it("reports a connection to reconnect, and refuses a profile it cannot verify", async () => {
    expect(
      await client.rpc.call("provider.chatgpt.reconnect-profile", {
        instanceId: managed,
        methodId: "chatgpt-change-account",
      }),
    ).toBeNull();
    expect(
      await refusal(
        client.rpc.call("provider.chatgpt.reconnect-profile", {
          instanceId: managed,
          methodId: "chatgpt-profile:oaiapp_generic",
        }),
      ),
    ).toMatchObject({ _tag: "ProviderSetupError", operation: "export" });
    expect(
      await refusal(
        client.rpc.call("provider.chatgpt.import-profile", {
          instanceId: managed,
          profile: mismatchedProfile,
        }),
      ),
    ).toMatchObject({ _tag: "ProviderSetupError" });
  }, 60_000);

  it("runs a handoff sign-in until the caller closes the stream", async () => {
    const { environment } = await client.rpc.call("server.getConfig", {});
    const stream = client.rpc.stream("provider.chatgpt.handoff.subscribe", {
      instanceId: managed,
      environmentId: environment.environmentId,
      attemptId: "generic-attempt",
      returnUrl: "http://127.0.0.1:1/return",
      profile: null,
    });
    for await (const item of stream) {
      if (item.kind === "decode-error") throw item.error;
      if (isUnknownVariant<"phase">(item.value)) throw new Error("Expected a known handoff state.");
      if (item.value.phase !== "auth") throw new Error("Expected no finished sign-in.");
      const { state } = item.value;
      if (state.phase === "failed") {
        expect(state.message).toMatch(metadataUnreachable);
        return;
      }
      if (state.phase === "waiting") {
        expect(state.interaction).toMatchObject({ type: "browser" });
        return;
      }
    }
    throw new Error("The stream ended without a waiting state.");
  }, 60_000);

  it("refuses a reset credit that does not exist, without reaching an account", async () => {
    for (const instanceId of [managed, missing]) {
      expect(
        await refusal(client.rpc.call("provider.consumeResetCredit", { instanceId })),
      ).toMatchObject({ _tag: "ProviderSetupError", operation: "consume-reset-credit" });
    }
    expect(
      await refusal(
        client.rpc.call("provider.consumeResetCredit", {
          sourceId: "absent",
          accountId: "generic-account",
          creditId: "generic-credit",
        }),
      ),
    ).toMatchObject({ _tag: "UsageLimitSourceError" });
  });

  it("refuses feedback for a thread with no provider session", async () => {
    const threadId = ThreadId.parse("absent-thread");
    expect(
      await refusal(client.rpc.call("provider.uploadFeedback", { threadId, reason: "generic" })),
    ).toMatchObject({ _tag: "ProviderUploadFeedbackError", threadId });
  });
});
