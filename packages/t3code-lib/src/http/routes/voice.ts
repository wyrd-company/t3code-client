// ---
// relationships:
//   implements: library-transport
// ---
/**
 * The `/api/voice` routes: local speech models, transcription on the environment machine, cloud
 * speech providers and transcript cleanup. A failure is an `EnvironmentRequestInvalidError` with
 * reason `invalid_audio`, `speech_unavailable` or `speech_busy`, or, from a cloud route, a 422
 * `schemas.speech.CloudSpeechError`. Build a transcription body with `encodeSpeechPcmRequest`.
 */
import { z } from "zod";

import { SecretReference } from "../../schemas/providerInstance.ts";
import {
  CloudSpeechApiKey,
  CloudSpeechKeys,
  CloudSpeechModelId,
  CloudSpeechModels,
  CloudSpeechProvider,
  EnvironmentSpeechAccelerationRequest,
  EnvironmentSpeechModelLinkRequest,
  EnvironmentSpeechModelRequest,
  EnvironmentSpeechModelUnloadTimeoutRequest,
  EnvironmentSpeechModels,
  EnvironmentSpeechPostProcessingRequest,
  EnvironmentSpeechPostProcessingResult,
  EnvironmentSpeechStatus,
  EnvironmentSpeechTranscriptionResult,
} from "../../schemas/speech.ts";
import { defineRoute } from "../spec.ts";

const audio = z.instanceof(Uint8Array);
const provider = z.strictObject({ provider: CloudSpeechProvider });
const modelRequest = z.strictObject({ body: EnvironmentSpeechModelRequest });

/** A model route answers with the whole catalog, so a caller sees every state change. */
const modelRoute = (path: string) =>
  defineRoute({
    method: "POST",
    path,
    auth: "required",
    scope: "settings:write",
    input: modelRequest,
    success: EnvironmentSpeechModels,
  });

export const voiceRoutes = {
  "voice.cloudKeys": defineRoute({
    method: "GET",
    path: "/api/voice/cloud/keys",
    auth: "required",
    scope: "orchestration:operate",
    input: z.undefined(),
    success: CloudSpeechKeys,
  }),
  /** `key: null` removes the provider's key. The server keeps a literal key in its secret store. */
  "voice.setCloudKey": defineRoute({
    method: "POST",
    path: "/api/voice/cloud/:provider/key",
    auth: "required",
    scope: "settings:write",
    input: z.strictObject({
      params: provider,
      body: z.strictObject({ key: z.union([CloudSpeechApiKey, SecretReference]).nullable() }),
    }),
    success: z.undefined(),
  }),
  "voice.cloudModels": defineRoute({
    method: "GET",
    path: "/api/voice/cloud/openrouter/models",
    auth: "required",
    scope: "orchestration:operate",
    input: z.undefined(),
    success: CloudSpeechModels,
  }),
  /** Sends the recording to the provider. `model` picks an OpenRouter model. */
  "voice.transcribeCloud": defineRoute({
    method: "POST",
    path: "/api/voice/cloud/:provider/transcribe",
    auth: "required",
    scope: "orchestration:operate",
    input: z.strictObject({
      params: provider,
      query: z.strictObject({ model: CloudSpeechModelId.optional() }).optional(),
      body: audio,
    }),
    success: EnvironmentSpeechTranscriptionResult,
  }),
  "voice.status": defineRoute({
    method: "GET",
    path: "/api/voice/status",
    auth: "required",
    scope: "orchestration:operate",
    input: z.undefined(),
    success: EnvironmentSpeechStatus,
  }),
  /** Loads the selected model, so that the next transcription starts at once. */
  "voice.prepareModel": defineRoute({
    method: "POST",
    path: "/api/voice/models/prepare",
    auth: "required",
    scope: "orchestration:operate",
    input: z.undefined(),
    success: z.undefined(),
  }),
  /** `benchmarks: "1"` adds each model's measured accuracy and speed. */
  "voice.models": defineRoute({
    method: "GET",
    path: "/api/voice/models",
    auth: "required",
    scope: "orchestration:operate",
    input: z.strictObject({ query: z.strictObject({ benchmarks: z.literal("1") }) }).optional(),
    success: EnvironmentSpeechModels,
  }),
  "voice.downloadModel": modelRoute("/api/voice/models/download"),
  "voice.selectModel": modelRoute("/api/voice/models/select"),
  "voice.cancelModelDownload": modelRoute("/api/voice/models/cancel"),
  "voice.removeModel": modelRoute("/api/voice/models/remove"),
  /**
   * Uses a model file, or the model files of a folder, from elsewhere on the environment's disk.
   * The path is on the server's machine, so the route also needs `filesystem:read`. A model read
   * by a session without `filesystem:read` leaves out `linkedFrom`.
   */
  "voice.linkModels": defineRoute({
    method: "POST",
    path: "/api/voice/models/link",
    auth: "required",
    scope: "settings:write",
    inputScopes: () => ["filesystem:read"],
    input: z.strictObject({ body: EnvironmentSpeechModelLinkRequest }),
    success: EnvironmentSpeechModels,
  }),
  "voice.updateAcceleration": defineRoute({
    method: "POST",
    path: "/api/voice/acceleration",
    auth: "required",
    scope: "settings:write",
    input: z.strictObject({ body: EnvironmentSpeechAccelerationRequest }),
    success: EnvironmentSpeechStatus,
  }),
  "voice.updateModelUnloadTimeout": defineRoute({
    method: "POST",
    path: "/api/voice/model-unload-timeout",
    auth: "required",
    scope: "settings:write",
    input: z.strictObject({ body: EnvironmentSpeechModelUnloadTimeoutRequest }),
    success: EnvironmentSpeechStatus,
  }),
  /** Transcribes on the environment machine with the selected model. */
  "voice.transcribe": defineRoute({
    method: "POST",
    path: "/api/voice/transcribe",
    auth: "required",
    scope: "orchestration:operate",
    input: z.strictObject({ body: audio }),
    success: EnvironmentSpeechTranscriptionResult,
  }),
  /** Cleans a transcript with the transcript cleanup model. `draft` is the text it goes into. */
  "voice.postProcess": defineRoute({
    method: "POST",
    path: "/api/voice/post-process",
    auth: "required",
    scope: "orchestration:operate",
    input: z.strictObject({ body: EnvironmentSpeechPostProcessingRequest }),
    success: EnvironmentSpeechPostProcessingResult,
  }),
};
