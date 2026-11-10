// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { AssetResource } from "./assets.ts";
import { AuthCreatePairingCredentialInput, AuthPairingCredentialResult } from "./auth.ts";
import { DeviceSimlockIdentityInput } from "./device.ts";
import { SimlockDeviceHosts } from "./deviceHosts.ts";
import { ExecutionEnvironmentCapabilities } from "./environment.ts";
import { ProjectScript } from "./projects.ts";
import { ReviewDiffPreviewInput, ReviewDiffPreviewResult } from "./review.ts";
import { FilesystemBrowseError } from "./rpcErrors/files.ts";
import { SecretRequestError } from "./rpcErrors/server.ts";
import { ServerConfig } from "./server.ts";
import { SecretRequestAnswerInput } from "./serverActions.ts";
import { requiredScopesForSettingsUpdate, ServerSettingsPatch } from "./settingsPatch.ts";
import { TerminalAttachInput, TerminalOpenInput } from "./terminal.ts";
import { UsageSource } from "./usage.ts";

const at = "2026-01-01T00:00:00.000Z";
const reference = { provider: "sample", reference: "sample/path" };

describe("field changes of 0.1.8 outside orchestration", () => {
  it("binds a pairing code to an agent access level", () => {
    expect(AuthCreatePairingCredentialInput.parse({ access: "auto" })).toEqual({ access: "auto" });
    expect(AuthCreatePairingCredentialInput.safeParse({ access: "sample" }).success).toBe(false);
    const issued = { id: "pairing-1", credential: "AUTO-SAMPLE", expiresAt: at };
    expect(AuthPairingCredentialResult.parse({ ...issued, access: "full-access" }).access).toBe(
      "full-access",
    );
    expect(AuthPairingCredentialResult.parse({ ...issued, access: "future-level" }).access).toBe(
      "future-level",
    );
  });

  it("reads the new capability flags", () => {
    const flags = {
      fastWorktreeCheckout: true,
      vcsBranchStatus: true,
      modelCatalogRefresh: true,
      mcpApprovalCodes: true,
      freshContext: true,
      scheduledTaskThreadModes: false,
    };
    expect(ExecutionEnvironmentCapabilities.parse(flags)).toMatchObject(flags);
    expect(ExecutionEnvironmentCapabilities.safeParse({ mcpApprovalCodes: "yes" }).success).toBe(
      false,
    );
  });

  it("answers a secret request with a reference and reads the provider of a failure", () => {
    const answer = { threadId: "thread-1", turnItemId: "item-1" };
    expect(
      SecretRequestAnswerInput.parse({ ...answer, answer: { type: "reference", reference } })
        .answer,
    ).toEqual({ type: "reference", reference });
    expect(
      SecretRequestAnswerInput.safeParse({ ...answer, answer: { type: "reference" } }).success,
    ).toBe(false);
    expect(
      SecretRequestError.parse({
        _tag: "SecretRequestError",
        reason: "reference_unreadable",
        provider: "Sample vault",
      }),
    ).toMatchObject({ reason: "reference_unreadable", provider: "Sample vault" });
    expect(ServerConfig.shape.secretRequestReferences.parse(true)).toBe(true);
  });

  it("takes a Simlock agent token as a secret reference", () => {
    expect(DeviceSimlockIdentityInput.parse({ agentToken: reference }).agentToken).toEqual(
      reference,
    );
    const host = {
      kind: "simlock",
      id: "host-1",
      label: "Sample",
      gatewayUrl: "https://gateway.example.test",
    };
    expect(SimlockDeviceHosts.parse([{ ...host, agentToken: reference }])[0]?.agentToken).toEqual(
      reference,
    );
  });

  it("filters a review diff and reads deferred patches", () => {
    const input = {
      cwd: "/sample",
      sourceKind: "branch-range",
      trackedOnly: true,
      metadataOnly: true,
    };
    expect(ReviewDiffPreviewInput.parse(input)).toEqual(input);
    expect(ReviewDiffPreviewInput.safeParse({ cwd: "/sample", sourceKind: "commit" }).success).toBe(
      false,
    );
    const source = {
      id: "source-1",
      kind: "working-tree",
      title: "Sample",
      baseRef: null,
      headRef: null,
      diff: "",
      diffHash: "hash",
      truncated: false,
      patchesDeferred: true,
    };
    const result = ReviewDiffPreviewResult.parse({
      cwd: "/sample",
      generatedAt: at,
      sources: [source],
      incomplete: true,
    });
    expect(result).toMatchObject({ incomplete: true, sources: [{ patchesDeferred: true }] });
  });

  it("stops a terminal or a project script when its thread settles", () => {
    const session = { threadId: "thread-1", terminalId: "terminal-1" };
    expect(
      TerminalOpenInput.parse({ ...session, cwd: "/sample", stopOnSettle: true }),
    ).toMatchObject({ stopOnSettle: true });
    expect(TerminalAttachInput.parse({ ...session, stopOnSettle: false }).stopOnSettle).toBe(false);
    const script = {
      id: "script-1",
      name: "Sample",
      command: "true",
      icon: "play",
      runOnWorktreeCreate: false,
      stopOnSettle: true,
    };
    expect(ProjectScript.parse(script).stopOnSettle).toBe(true);
  });

  it("reads a missing browse path and a change request media repository", () => {
    expect(
      FilesystemBrowseError.parse({
        _tag: "FilesystemBrowseError",
        message: "Missing.",
        pathMissing: true,
      }),
    ).toMatchObject({ pathMissing: true });
    const media = {
      _tag: "github-media",
      cwd: "/sample",
      url: "https://media.example.test/a.png",
      repository: "sample/repo",
    };
    expect(AssetResource.parse(media)).toEqual(media);
  });

  it("drops the usage source action", () => {
    expect(UsageSource.shape).not.toHaveProperty("action");
  });
});

describe("settings patch fields of 0.1.8", () => {
  it("takes the new server settings", () => {
    const patch = {
      fastWorktreeCheckout: true,
      promptSuggestionsEnabled: true,
      ghqCloneLayout: true,
      textGenerators: {
        sample: { kind: "openaiCompatible", baseUrl: "https://api.example.test/v1" },
        removed: null,
      },
    };
    expect(ServerSettingsPatch.parse(patch)).toEqual(patch);
    expect(ServerSettingsPatch.shape).not.toHaveProperty("cursorKeychainUsageEnabled");
    expect(
      ServerSettingsPatch.safeParse({
        textGenerators: { sample: { kind: "sample", baseUrl: "https://api.example.test" } },
      }).success,
    ).toBe(false);
  });

  it("asks for providers:manage for text generators", () => {
    const textGenerators = { sample: null };
    expect(requiredScopesForSettingsUpdate({ patch: { textGenerators } })).toEqual([
      "providers:manage",
    ]);
  });

  it("asks for both scopes when a secret provider is removed", () => {
    expect(
      requiredScopesForSettingsUpdate({ patch: { secretProviders: { sample: null } } }),
    ).toEqual(["settings:write", "providers:manage"]);
  });
});
