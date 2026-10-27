// ---
// relationships:
//   verifies: testing
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import { schemas, T3Client } from "@wyrd-company/t3code-lib";
import { liveCatalogSelection } from "../../test/support/liveCatalog.ts";
import { sampleProvider } from "../../test/support/automationHarness.ts";

const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
const provider = schemas.provider.ServerProvider.parse(sampleProvider);
const owned = {
  T3_LIVE_HOME: "/tmp/t3code-lib-live-sample/home",
  T3_LIVE_WORKSPACE: "/tmp/t3code-lib-live-sample/workspace",
  T3_LIVE_URL: "http://127.0.0.1:4000",
};
afterEach(() => vi.restoreAllMocks());

it("uses advertised models even when installation and auth are unavailable", async () => {
  vi.spyOn(client.server, "providers").mockResolvedValue([
    { ...provider, installed: false, status: "error" },
  ]);
  const write = vi.spyOn(client.rpc, "callRaw");
  expect(await liveCatalogSelection(client, {})).toEqual({
    instanceId: provider.instanceId,
    model: "sample-model",
  });
  expect(write).not.toHaveBeenCalled();
});

it("rejects external overrides without a catalog instead of mutating or skipping", async () => {
  vi.spyOn(client.server, "providers").mockResolvedValue([]);
  const write = vi.spyOn(client.rpc, "callRaw");
  for (const env of [
    {},
    { ...owned, T3_LIVE_HOME: "/sample/operational/home" },
    { ...owned, T3_LIVE_URL: "https://server.invalid" },
    { ...owned, T3_LIVE_WORKSPACE: "/sample" },
  ])
    await expect(liveCatalogSelection(client, env)).rejects.toThrow(
      "requires an owned live server",
    );
  expect(write).not.toHaveBeenCalled();
});

it("seeds a separate generic instance and waits for its advertised custom model", async () => {
  vi.spyOn(client.server, "providers").mockResolvedValue([]);
  const write = vi.spyOn(client.rpc, "callRaw").mockResolvedValue({});
  let finished = false;
  vi.spyOn(client.server, "watchConfig").mockImplementation(async function* () {
    try {
      yield { type: "providerStatuses", version: 1, payload: { providers: [] } };
      yield {
        type: "providerStatuses",
        version: 1,
        payload: {
          providers: [
            {
              ...provider,
              instanceId: schemas.common.providerInstanceId("sample-validation"),
              installed: false,
              models: [
                {
                  slug: "sample-catalog-model",
                  name: "Sample",
                  isCustom: true,
                  capabilities: null,
                },
              ],
            },
          ],
        },
      };
    } finally {
      finished = true;
    }
  });
  expect(await liveCatalogSelection(client, owned)).toEqual({
    instanceId: "sample-validation",
    model: "sample-catalog-model",
  });
  expect(write).toHaveBeenCalledWith("server.updateSettings", {
    patch: {},
    providerInstanceMutation: {
      operation: "create",
      instanceId: "sample-validation",
      instance: {
        driver: "codex",
        enabled: true,
        config: { binaryPath: "/sample/missing-codex", customModels: ["sample-catalog-model"] },
      },
    },
  });
  expect(finished).toBe(true);
});
