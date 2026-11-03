// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, it } from "vite-plus/test";
import {
  AcpRegistryAgentInput,
  AcpRegistrySearchInput,
  AcpRegistrySearchResult,
  AcpRegistrySetProviderInput,
} from "./acpRegistry.ts";
import { ProviderInstanceId, ProjectId, isUnknownVariant } from "./common.ts";
import { ProviderInstallState } from "./providerInstall.ts";
import { decodeRpcErrorRecord } from "./rpcErrors.ts";

const scope = {
  instanceId: ProviderInstanceId.parse("sample"),
  projectId: ProjectId.parse("sample"),
};

describe("ACP registry inputs", () => {
  it("takes only an agent id of the registry's form", () => {
    expect(AcpRegistryAgentInput.parse({ agentId: "sample.agent-1" }).agentId).toBe(
      "sample.agent-1",
    );
    expect(AcpRegistryAgentInput.safeParse({ agentId: "../sample" }).success).toBe(false);
    expect(AcpRegistryAgentInput.safeParse({ agentId: "Sample" }).success).toBe(false);
  });

  it("keeps a search within the catalog's bounds", () => {
    expect(AcpRegistrySearchInput.parse({ query: " sample " }).query).toBe("sample");
    expect(AcpRegistrySearchInput.safeParse({ query: "", limit: 513 }).success).toBe(false);
    expect(AcpRegistrySearchInput.safeParse({ query: "s".repeat(121) }).success).toBe(false);
  });

  it("bounds a provider's headers", () => {
    const input = {
      ...scope,
      providerId: "main",
      apiType: "openai",
      baseUrl: "https://example.invalid",
    };
    expect(
      AcpRegistrySetProviderInput.safeParse({ ...input, headers: { "x-sample": "value" } }).success,
    ).toBe(true);
    expect(
      AcpRegistrySetProviderInput.safeParse({
        ...input,
        headers: { "x-sample": "v".repeat(8_193) },
      }).success,
    ).toBe(false);
  });
});

describe("ACP registry and install results", () => {
  it("decodes a newer server's distribution", () => {
    const agent = {
      id: "sample",
      name: "Sample",
      version: "1.0.0",
      description: "",
      authors: [],
      license: null,
      website: null,
      repository: null,
      icon: null,
      distribution: "newer",
      integrity: "registry",
    };
    expect(AcpRegistrySearchResult.parse({ agents: [agent] }).agents[0]?.distribution).toBe(
      "newer",
    );
  });

  it("decodes an install state, with a newer server's phase", () => {
    const state = {
      driver: "codex",
      operationId: null,
      phase: "newer",
      downloadedBytes: 0,
      totalBytes: null,
      version: null,
      installedVersion: null,
      canRemove: false,
      message: null,
    };
    expect(ProviderInstallState.parse(state).phase).toBe("newer");
    expect(ProviderInstallState.safeParse({ ...state, downloadedBytes: -1 }).success).toBe(false);
  });

  it("decodes a refusal with its sign-in details", () => {
    const record = decodeRpcErrorRecord({
      _tag: "AcpRegistryOperationError",
      reason: "authentication_failed",
      message: "Sign in to the agent.",
      authMethods: [{ id: "sample", name: "Sample", description: null, type: "agent" }],
      authAction: { elicitationId: "sample", url: "https://example.invalid", message: "" },
    });
    expect(isUnknownVariant(record)).toBe(false);
    expect(record).toMatchObject({
      reason: "authentication_failed",
      authAction: { elicitationId: "sample" },
    });
  });
});
