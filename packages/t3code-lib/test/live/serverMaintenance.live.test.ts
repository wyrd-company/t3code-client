// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The provider method removal, database reclaim and text generator model listing
 * of 0.1.8 on an owned stock server with its own `HOME`. The text generator is a
 * loopback stub, so no request leaves this machine. The owned server has no
 * supervisor to restart it, so a reclaim request is refused and nothing restarts.
 */
import type * as NodeHttp from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { T3Client } from "../../src/index.ts";
import { ProviderDriverKind, ProviderInstanceId } from "../../src/schemas/common.ts";
import type { DatabaseStorageStatus } from "../../src/schemas/databaseStorage.ts";
import { firstItem, hasLiveServer, refusal } from "./liveClient.ts";
import { startLocalHttp, type LocalHttp } from "./localHttp.ts";
import { startScratchServer, withScopes, type PeerServer } from "./peerServer.ts";

const managed = ProviderInstanceId.parse("signin");
const generatorId = ProviderInstanceId.parse("sample-generator");
const sampleKey = "sample-key";

/** An OpenAI-compatible stub that lists two models and answers each completion with OK. */
const stubApi =
  (requests: string[]): NodeHttp.RequestListener =>
  (request, response) => {
    requests.push(`${request.method} ${request.url} ${request.headers.authorization ?? "-"}`);
    response.setHeader("content-type", "application/json");
    if (request.method === "GET" && request.url === "/v1/models") {
      response.end(
        JSON.stringify({
          data: [{ id: "sample-mini" }, { id: "sample-large" }],
        }),
      );
      return;
    }
    if (request.method === "POST" && request.url === "/v1/chat/completions") {
      request.resume();
      response.end(
        JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: "OK" } }],
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end("{}");
  };

describe.skipIf(!hasLiveServer)("server maintenance methods of 0.1.8", () => {
  let peer: PeerServer;
  let client: T3Client;
  let api: LocalHttp;
  const requests: string[] = [];
  beforeAll(async () => {
    api = await startLocalHttp(stubApi(requests));
    peer = await startScratchServer("t3code-lib-server-maintenance-");
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
    await api?.close();
  });

  it("refuses to remove a sign-in method that canRemove does not allow", async () => {
    const state = await firstItem(
      client.rpc.stream("provider.auth.subscribe", { instanceId: managed }),
      (item) => item,
    );
    expect(state.methods?.length).toBeGreaterThan(0);
    for (const method of state.methods ?? []) expect(method.canRemove).not.toBe(true);
    expect(
      await refusal(
        client.rpc.call("provider.auth.removeMethod", {
          instanceId: managed,
          methodId: "chatgpt",
        }),
      ),
    ).toMatchObject({ _tag: "ProviderSetupError", instanceId: managed });
    await withScopes(peer, ["orchestration:read"], async (reader) => {
      const input = { instanceId: managed, methodId: "chatgpt" };
      await expect(reader.rpc.call("provider.auth.removeMethod", input)).rejects.toThrow(
        /providers:manage/u,
      );
      expect(await refusal(reader.rpc.callRaw("provider.auth.removeMethod", input))).toMatchObject({
        _tag: "EnvironmentAuthorizationError",
        requiredPermission: "providers:manage",
      });
    });
  });

  it("reports canReclaim false and refuses a reclaim with DatabaseReclaimError", async () => {
    const status = await firstItem(
      client.rpc.stream("server.getDatabaseStorage", {}),
      (item: DatabaseStorageStatus | null) => item ?? undefined,
    );
    // A true value would mean that the request restarts the server, so the test stops here.
    expect(status.canReclaim).toBe(false);
    expect(status.reclaimFailure).toBeUndefined();
    const record = await refusal(client.rpc.call("server.reclaimDatabaseSpace", {}));
    expect(record).toMatchObject({ _tag: "DatabaseReclaimError" });
    expect(typeof (record as { reason?: unknown }).reason).toBe("string");
    await withScopes(peer, ["settings:write"], async (writer) => {
      await expect(writer.rpc.call("server.reclaimDatabaseSpace", {})).rejects.toThrow(
        /environment:maintain/u,
      );
      expect(await refusal(writer.rpc.callRaw("server.reclaimDatabaseSpace", {}))).toMatchObject({
        _tag: "EnvironmentAuthorizationError",
        requiredPermission: "environment:maintain",
      });
    });
    expect(await client.server.environment()).toBeDefined();
  });

  it("lists and tests the models of unsaved text generator settings", async () => {
    const config = {
      kind: "openaiCompatible" as const,
      label: "Sample API",
      baseUrl: `${api.url}/v1`,
      apiKey: sampleKey,
    };
    const listed = await client.rpc.call("server.listTextGeneratorModels", {
      id: generatorId,
      config,
    });
    expect(listed).toEqual({
      models: [
        { id: "sample-large", name: "sample-large" },
        { id: "sample-mini", name: "sample-mini" },
      ],
    });
    const tested = await client.rpc.call("server.listTextGeneratorModels", {
      id: generatorId,
      config,
      test: true,
    });
    expect(tested.testedModel).toBe("sample-mini");
    expect(requests).toEqual([
      `GET /v1/models Bearer ${sampleKey}`,
      `GET /v1/models Bearer ${sampleKey}`,
      `POST /v1/chat/completions Bearer ${sampleKey}`,
    ]);
  });

  it("refuses an unknown generator, an unreachable API and a reader", async () => {
    expect(
      await refusal(client.rpc.call("server.listTextGeneratorModels", { id: generatorId })),
    ).toMatchObject({ _tag: "TextGeneratorError" });
    expect(
      await refusal(
        client.rpc.call("server.listTextGeneratorModels", {
          id: generatorId,
          config: { kind: "openaiCompatible", baseUrl: `${api.url}/missing` },
        }),
      ),
    ).toMatchObject({ _tag: "TextGeneratorError" });
    await withScopes(peer, ["orchestration:read"], async (reader) => {
      const input = { id: generatorId };
      await expect(reader.rpc.call("server.listTextGeneratorModels", input)).rejects.toThrow(
        /settings:write/u,
      );
      expect(
        await refusal(reader.rpc.callRaw("server.listTextGeneratorModels", input)),
      ).toMatchObject({
        _tag: "EnvironmentAuthorizationError",
        requiredPermission: "settings:write",
      });
    });
  });

  it("accepts the provider catalog input fields", async () => {
    const refreshed = await client.rpc.call("server.refreshProviders", {
      modelCatalogOnly: true,
      providerCatalogsOnDemand: true,
    });
    expect(Array.isArray(refreshed.providers)).toBe(true);
    const stream = client.server.watchConfig({
      workspaceSnapshotsOnDemand: true,
      providerCatalogsOnDemand: true,
    });
    for await (const item of stream) {
      expect(item).not.toHaveProperty("kind", "decode-error");
      expect(item).toHaveProperty("type");
      break;
    }
  });
});
