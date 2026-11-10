// ---
// relationships:
//   verifies: library-transport
// ---
import { describe, expect, it, vi } from "vite-plus/test";

import { T3HttpError, T3PreconditionError } from "../errors.ts";
import {
  CloudSpeechError,
  EnvironmentSpeechModels,
  EnvironmentSpeechStatus,
} from "../schemas/speech.ts";
import { HttpTransport } from "../transport/http.ts";
import { HttpRouteClient } from "./client.ts";
import { httpRoutes } from "./registry.ts";
import { SPEECH_MAX_OPTIONS_BYTES, encodeSpeechPcmRequest } from "./speechAudio.ts";

function setup(answer: () => Response) {
  const requests: Request[] = [];
  const http = new HttpTransport({
    baseUrl: "https://host.invalid",
    fetch: vi.fn<typeof globalThis.fetch>(async (input, init) => {
      requests.push(new Request(input, init));
      return answer();
    }),
    getAccessToken: async () => "sample-token",
  });
  return { requests, routes: new HttpRouteClient(http, httpRoutes) };
}

const sampleModel = {
  id: "sample/model",
  name: "Sample",
  description: "A sample model.",
  size: 1000,
  languages: ["en"],
  accuracy: 0.9,
  speed: 0.8,
  recommended: true,
  supportsStreaming: false,
  supportsLanguageDetection: true,
  supportsTranslation: false,
  active: false,
  state: "downloadable",
};

describe("encodeSpeechPcmRequest", () => {
  it("frames the options length, the options JSON and the audio", () => {
    const pcm = new Uint8Array([1, 2, 3, 4]);
    const body = encodeSpeechPcmRequest(pcm, {
      speechLanguage: "en",
      speechTranslateToEnglish: false,
      speechCustomWords: [{ term: "Sample", aliases: [] }],
      speechRemoveFillerWords: false,
    });
    const length = new DataView(body.buffer).getUint32(0, true);
    const options = JSON.parse(new TextDecoder().decode(body.subarray(4, 4 + length)));
    expect(options).toMatchObject({ speechLanguage: "en", speechSilenceFiltering: true });
    expect(body.subarray(4 + length)).toEqual(pcm);
  });

  it("refuses audio that is not whole samples, duplicate words and options too large", () => {
    expect(() => encodeSpeechPcmRequest(new Uint8Array())).toThrow(T3PreconditionError);
    expect(() => encodeSpeechPcmRequest(new Uint8Array(3))).toThrow(T3PreconditionError);
    const options = {
      speechLanguage: "auto",
      speechTranslateToEnglish: false,
      speechRemoveFillerWords: true,
    };
    expect(() =>
      encodeSpeechPcmRequest(new Uint8Array(4), {
        ...options,
        speechCustomWords: [{ term: "Sample", aliases: ["sample"] }],
      }),
    ).toThrow(T3PreconditionError);
    expect(() =>
      encodeSpeechPcmRequest(new Uint8Array(4), {
        ...options,
        speechCustomWords: [],
        sample: "x".repeat(SPEECH_MAX_OPTIONS_BYTES),
      }),
    ).toThrow("too large");
  });
});

describe("voice routes", () => {
  it("sends a recording as raw bytes and decodes the transcript", async () => {
    const { requests, routes } = setup(() => Response.json({ text: "Sample text." }));
    const body = encodeSpeechPcmRequest(new Uint8Array(4));
    await expect(routes.call("voice.transcribe", { body })).resolves.toEqual({
      text: "Sample text.",
    });
    const request = requests[0] as Request;
    expect(request.headers.get("content-type")).toBe("application/octet-stream");
    expect(new Uint8Array(await request.arrayBuffer())).toEqual(body);
  });

  it("names the provider and model of a cloud transcription", async () => {
    const { requests, routes } = setup(() => Response.json({ text: "" }));
    await routes.call("voice.transcribeCloud", {
      params: { provider: "openrouter" },
      query: { model: "sample/model" },
      body: encodeSpeechPcmRequest(new Uint8Array(4)),
    });
    const url = new URL(requests[0]?.url ?? "");
    expect(url.pathname).toBe("/api/voice/cloud/openrouter/transcribe");
    expect(url.searchParams.get("model")).toBe("sample/model");
    await expect(
      routes.call("voice.transcribeCloud", {
        params: { provider: "openrouter" },
        query: { model: "openrouter/auto" },
        body: new Uint8Array([1]),
      }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
  });

  it("raises a cloud failure with its tag and a body that decodes", async () => {
    const failure = { _tag: "CloudSpeechError", provider: "openai", reason: "missing-key" };
    const { routes } = setup(() => Response.json(failure, { status: 422 }));
    const error = await routes.call("voice.cloudKeys").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(T3HttpError);
    expect(error).toMatchObject({ status: 422, tag: "CloudSpeechError" });
    expect(CloudSpeechError.parse((error as T3HttpError).body)).toMatchObject(failure);
  });

  it("sets and clears a cloud key, and refuses a URL as a key", async () => {
    const { requests, routes } = setup(() => new Response(null, { status: 204 }));
    await routes.call("voice.setCloudKey", { params: { provider: "xai" }, body: { key: null } });
    await routes.call("voice.setCloudKey", {
      params: { provider: "xai" },
      body: { key: { provider: "sample", reference: "sample/key" } },
    });
    expect(await requests[0]?.json()).toEqual({ key: null });
    await expect(
      routes.call("voice.setCloudKey", {
        params: { provider: "xai" },
        body: { key: "https://host.invalid/key" },
      }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
  });

  it("asks for benchmarks and reads each model's state", async () => {
    const { requests, routes } = setup(() => Response.json({ models: [sampleModel] }));
    const { models } = await routes.call("voice.models", { query: { benchmarks: "1" } });
    expect(models[0]?.state).toBe("downloadable");
    expect(new URL(requests[0]?.url ?? "").searchParams.get("benchmarks")).toBe("1");
    await routes.call("voice.downloadModel", { body: { modelId: "sample/model" } });
    expect(await requests[1]?.json()).toEqual({ modelId: "sample/model" });
  });
});

describe("speech schemas", () => {
  it("reads both benchmark shapes as one", () => {
    const accuracy = { en: { grade: "A", errorPercent: 2 } };
    const legacy = EnvironmentSpeechModels.parse({
      models: [
        { ...sampleModel, benchmark: { accuracy, secondsPer30s: 1.5, cpuSecondsPer30s: 4 } },
      ],
    });
    expect(legacy.models[0]?.benchmark?.secondsPer30s).toEqual({ accelerated: 1.5, cpu: 4 });
    const current = EnvironmentSpeechModels.parse({
      models: [{ ...sampleModel, benchmark: { accuracy, secondsPer30s: { accelerated: null } } }],
    });
    expect(current.models[0]?.benchmark?.secondsPer30s).toEqual({ accelerated: null });
  });

  it("derives the benchmark tier that an older server omits", () => {
    const status = {
      supported: true,
      state: "ready",
      modelId: "sample/model",
      model: "Sample",
      size: 1000,
      supportsStreaming: false,
      supportsTranslation: false,
      acceleration: "auto",
      modelUnloadTimeout: "min_15",
      gpuDevices: [],
    };
    expect(EnvironmentSpeechStatus.parse(status)).toMatchObject({ benchmarkTier: "cpu" });
    expect(
      EnvironmentSpeechStatus.parse({ ...status, gpuDevices: [{ id: "0", name: "Sample GPU" }] }),
    ).toMatchObject({ benchmarkTier: "accelerated" });
    expect(EnvironmentSpeechStatus.parse({ supported: false, reason: "Sample." })).toEqual({
      supported: false,
      reason: "Sample.",
    });
  });
});
