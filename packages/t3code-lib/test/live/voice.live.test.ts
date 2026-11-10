// ---
// relationships:
//   verifies: library-transport
// ---
/**
 * The voice routes on a real stock server. No model is downloaded and no cloud provider is called:
 * the cloud transcription has no key, and the model writes name a model that does not exist.
 */
import { afterAll, describe, expect, it } from "vite-plus/test";
import { T3HttpError, encodeSpeechPcmRequest } from "../../src/index.ts";
import { SpeechAcceleration, SpeechModelUnloadTimeout } from "../../src/schemas/speech.ts";
import { connect, hasLiveServer } from "./liveClient.ts";

const refusal = async (promise: Promise<unknown>) => {
  const outcome = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (!(outcome instanceof T3HttpError)) throw new Error("Expected an HTTP refusal.");
  return { status: outcome.status, tag: outcome.tag, reason: outcome.reason };
};

describe.skipIf(!hasLiveServer)("voice routes", () => {
  const client = connect();
  const missing = { body: { modelId: "sample/missing-model" } };

  afterAll(async () => {
    await client.close();
  });

  it("reads the status, the catalog and the benchmarks", async () => {
    const status = await client.routes.call("voice.status");
    if (status.supported) expect(["cpu", "accelerated"]).toContain(status.benchmarkTier);
    const { models } = await client.routes.call("voice.models");
    expect(models.length).toBeGreaterThan(0);
    const measured = await client.routes.call("voice.models", { query: { benchmarks: "1" } });
    expect(measured.models.some((model) => model.benchmark !== undefined)).toBe(true);
    const descriptor = await client.routes.call("metadata.descriptor");
    expect(descriptor.capabilities?.voiceTranscription).toBe(true);
  });

  it("sets and clears a cloud key, and refuses a cloud transcription without one", async () => {
    await client.routes.call("voice.setCloudKey", {
      params: { provider: "xai" },
      body: { key: "sample-key-value" },
    });
    expect((await client.routes.call("voice.cloudKeys")).xai).toBe(true);
    await client.routes.call("voice.setCloudKey", {
      params: { provider: "xai" },
      body: { key: null },
    });
    expect((await client.routes.call("voice.cloudKeys")).xai).toBe(false);
    const body = encodeSpeechPcmRequest(new Uint8Array(4));
    await expect(
      refusal(
        client.routes.call("voice.transcribeCloud", { params: { provider: "openai" }, body }),
      ),
    ).resolves.toEqual({ status: 422, tag: "CloudSpeechError", reason: "missing-key" });
  });

  it("refuses audio it cannot read and a model it does not know", async () => {
    await expect(
      refusal(client.routes.call("voice.transcribe", { body: new Uint8Array([1, 2, 3]) })),
    ).resolves.toMatchObject({ status: 400, reason: "invalid_audio" });
    for (const route of ["voice.selectModel", "voice.removeModel"] as const)
      await expect(refusal(client.routes.call(route, missing))).resolves.toMatchObject({
        status: 400,
        reason: "invalid_command",
      });
    // The selected model is not installed, so there is nothing to load.
    await expect(refusal(client.routes.call("voice.prepareModel"))).resolves.toMatchObject({
      status: 400,
    });
    const { models } = await client.routes.call("voice.cancelModelDownload", missing);
    expect(models.every((model) => model.state !== "downloading")).toBe(true);
  });

  it("changes the acceleration and the unload timeout", async () => {
    const before = await client.routes.call("voice.status");
    if (!before.supported) return;
    const cpu = await client.routes.call("voice.updateAcceleration", {
      body: { acceleration: "cpu" },
    });
    expect(cpu).toMatchObject({ acceleration: "cpu", benchmarkTier: "cpu" });
    const never = await client.routes.call("voice.updateModelUnloadTimeout", {
      body: { timeout: "never" },
    });
    expect(never).toMatchObject({ modelUnloadTimeout: "never" });
    await client.routes.call("voice.updateAcceleration", {
      body: { acceleration: SpeechAcceleration.parse(before.acceleration) },
    });
    await client.routes.call("voice.updateModelUnloadTimeout", {
      body: { timeout: SpeechModelUnloadTimeout.parse(before.modelUnloadTimeout) },
    });
  });
});
