// ---
// relationships:
//   verifies: library-wire
// ---
/** The 0.1.8 provider method removal, database reclaim and text generator model listing. */
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { rpcMethods } from "../rpc/registry.ts";
import type { RpcPayload, RpcSuccess } from "../rpc/spec.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import { DatabaseStorageStatus } from "./databaseStorage.ts";
import { ProviderAuthMethod, ProviderAuthRemoveMethodInput } from "./providerSetup.ts";
import { decodeRpcErrorRecord, isRpcErrorOfTag } from "./rpcErrors.ts";
import {
  ListTextGeneratorModelsInput,
  ListTextGeneratorModelsResult,
  TextGeneratorConfig,
} from "./textGenerator.ts";

const status = {
  databaseBytes: 4096,
  reclaimableBytes: 1024,
  incrementalVacuumEnabled: false,
  compactCommand: "sample-cli doctor",
};
const generator = {
  kind: "openaiCompatible",
  baseUrl: "https://models.example.invalid/v1",
};

describe("provider.auth.removeMethod", () => {
  it("is a providers:manage call that returns the auth state", () => {
    expect(rpcMethods["provider.auth.removeMethod"]).toMatchObject({
      stream: false,
      scope: "providers:manage",
    });
    expect(
      ProviderAuthRemoveMethodInput.parse({
        instanceId: "generic",
        methodId: "method-1",
      }),
    ).toEqual({ instanceId: "generic", methodId: "method-1" });
    for (const methodId of ["", "  ", "x".repeat(129)]) {
      expect(
        ProviderAuthRemoveMethodInput.safeParse({
          instanceId: "generic",
          methodId,
        }).success,
      ).toBe(false);
    }
  });

  it("reads canRemove on a method and keeps it optional", () => {
    const method = {
      id: "m",
      name: "Method",
      description: null,
      type: "agent",
    };
    expect(ProviderAuthMethod.parse(method).canRemove).toBeUndefined();
    expect(ProviderAuthMethod.parse({ ...method, canRemove: true }).canRemove).toBe(true);
    expect(ProviderAuthMethod.safeParse({ ...method, canRemove: "yes" }).success).toBe(false);
    expectTypeOf<ProviderAuthMethod["canRemove"]>().toEqualTypeOf<boolean | undefined>();
  });
});

describe("server.reclaimDatabaseSpace", () => {
  it("is an environment:maintain call with no payload fields and no result", () => {
    expect(rpcMethods["server.reclaimDatabaseSpace"]).toMatchObject({
      stream: false,
      scope: "environment:maintain",
    });
    expectTypeOf<RpcSuccess<RpcMethods, "server.reclaimDatabaseSpace">>().toEqualTypeOf<void>();
  });

  it("reads canReclaim and reclaimFailure on the storage status", () => {
    expect(DatabaseStorageStatus.parse(status)).toEqual(status);
    const failed = {
      ...status,
      canReclaim: true,
      reclaimFailure: "Disk full.",
    };
    expect(DatabaseStorageStatus.parse(failed)).toEqual(failed);
    expect(DatabaseStorageStatus.safeParse({ ...status, canReclaim: 1 }).success).toBe(false);
    expect(DatabaseStorageStatus.safeParse({ ...status, reclaimFailure: null }).success).toBe(
      false,
    );
  });

  it("decodes DatabaseReclaimError", () => {
    const record = decodeRpcErrorRecord({
      _tag: "DatabaseReclaimError",
      reason: "Stop first.",
    });
    expect(isRpcErrorOfTag(record, "DatabaseReclaimError")).toBe(true);
    expect(record).toEqual({
      _tag: "DatabaseReclaimError",
      reason: "Stop first.",
    });
  });
});

describe("server.listTextGeneratorModels", () => {
  it("is a settings:write call", () => {
    expect(rpcMethods["server.listTextGeneratorModels"]).toMatchObject({
      stream: false,
      scope: "settings:write",
    });
    expectTypeOf<
      RpcPayload<RpcMethods, "server.listTextGeneratorModels">
    >().toEqualTypeOf<ListTextGeneratorModelsInput>();
  });

  it("accepts a saved id, or unsaved settings with a literal or referenced key", () => {
    expect(ListTextGeneratorModelsInput.parse({ id: "generic" })).toEqual({
      id: "generic",
    });
    const input = {
      id: "generic",
      config: {
        ...generator,
        apiKey: { provider: "vault", reference: "item/key" },
      },
      refresh: true,
      test: true,
      model: "model-1",
    };
    expect(ListTextGeneratorModelsInput.parse(input)).toEqual(input);
    expect(
      TextGeneratorConfig.parse({
        ...generator,
        kind: "anthropic",
        apiKey: "k",
      }).kind,
    ).toBe("anthropic");
  });

  it("rejects a base URL with credentials, a query, a fragment or another scheme", () => {
    for (const baseUrl of [
      "ftp://models.example.invalid",
      "https://user:pass@models.example.invalid",
      "https://models.example.invalid/?key=1",
      "https://models.example.invalid/#part",
      "not a url",
      `https://models.example.invalid/${"x".repeat(2048)}`,
    ]) {
      expect(TextGeneratorConfig.safeParse({ ...generator, baseUrl }).success, baseUrl).toBe(false);
    }
    expect(TextGeneratorConfig.safeParse({ ...generator, kind: "other" }).success).toBe(false);
  });

  it("decodes the result and TextGeneratorError", () => {
    const result = {
      models: [{ id: "model-1", name: "Model 1" }],
      testedModel: "model-1",
    };
    expect(ListTextGeneratorModelsResult.parse(result)).toEqual(result);
    expect(ListTextGeneratorModelsResult.parse({ models: [] })).toEqual({
      models: [],
    });
    const record = decodeRpcErrorRecord({
      _tag: "TextGeneratorError",
      detail: "No key.",
    });
    expect(isRpcErrorOfTag(record, "TextGeneratorError")).toBe(true);
  });
});

describe("provider catalog input fields", () => {
  it("send modelCatalogOnly and providerCatalogsOnDemand", () => {
    const refresh = { modelCatalogOnly: true, providerCatalogsOnDemand: true };
    expect(rpcMethods["server.refreshProviders"].payload.parse(refresh)).toEqual(refresh);
    const subscribe = {
      workspaceSnapshotsOnDemand: true,
      providerCatalogsOnDemand: true,
    };
    expect(rpcMethods.subscribeServerConfig.payload.parse(subscribe)).toEqual(subscribe);
    expect(
      rpcMethods.subscribeServerConfig.payload.safeParse({
        providerCatalogsOnDemand: "yes",
      }).success,
    ).toBe(false);
  });
});
