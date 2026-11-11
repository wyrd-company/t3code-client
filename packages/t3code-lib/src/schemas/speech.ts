// ---
// relationships:
//   implements: library
// ---
/**
 * Voice transcription: the local speech models, the cloud speech providers and transcript cleanup
 * of the `/api/voice` routes. Mirrors `packages/contracts/src/speech.ts`.
 */
import { z } from "zod";

import { TrimmedNonEmptyString, forwardCompatibleLiteral } from "./common.ts";

export const CloudSpeechApiKey = TrimmedNonEmptyString.max(4096).regex(
  /^(?![a-z][a-z\d+.-]*:\/\/)[!-~]+$/i,
);

export const CloudSpeechProvider = z.enum(["openai", "xai", "openrouter"]);
export type CloudSpeechProvider = z.infer<typeof CloudSpeechProvider>;

/** Which cloud providers have a key. A server that predates OpenRouter omits `openrouter`. */
export const CloudSpeechKeys = z.looseObject({
  openai: z.boolean(),
  xai: z.boolean(),
  openrouter: z.boolean().optional(),
});
export type CloudSpeechKeys = z.infer<typeof CloudSpeechKeys>;

/** An exact `author/model` slug. Router shortcuts such as `openrouter/auto` are not models. */
export const CloudSpeechModelId = z
  .string()
  .min(3)
  .max(160)
  .regex(/^(?!openrouter\/)[a-z\d][a-z\d.-]*\/[a-z\d][a-z\d._-]*$/i);
export const CloudSpeechModel = z.looseObject({ id: CloudSpeechModelId, name: z.string() });
export type CloudSpeechModel = z.infer<typeof CloudSpeechModel>;
export const CloudSpeechModels = z.looseObject({ models: z.array(CloudSpeechModel) });
export type CloudSpeechModels = z.infer<typeof CloudSpeechModels>;

/** The 422 failure of the cloud routes, carried as the error body of a `T3HttpError`. */
export const CloudSpeechError = z.looseObject({
  _tag: z.literal("CloudSpeechError"),
  provider: forwardCompatibleLiteral(["openai", "xai", "openrouter"]),
  reason: forwardCompatibleLiteral([
    "missing-key",
    "key-changed",
    "unreadable-key",
    "rejected-key",
    "rate-limit",
    "model-unavailable",
    "unavailable",
  ]),
});
export type CloudSpeechError = z.infer<typeof CloudSpeechError>;

export const SpeechModelId = z.string().min(1).max(160);

const SpeechCustomWord = z.string().min(1).max(50);
const spellingKey = (spelling: string) => spelling.trim().normalize("NFC").toLocaleLowerCase();
/** At most 100 terms of up to 8 aliases. Every term and alias is unique, ignoring case. */
export const SpeechCustomWords = z
  .array(z.looseObject({ term: SpeechCustomWord, aliases: z.array(SpeechCustomWord).max(8) }))
  .max(100)
  .refine(
    (entries) => {
      const keys = entries.flatMap(({ term, aliases }) => [term, ...aliases]).map(spellingKey);
      return keys.every(Boolean) && new Set(keys).size === keys.length;
    },
    { message: "Dictionary terms and aliases must be unique and nonempty." },
  );
export type SpeechCustomWords = z.infer<typeof SpeechCustomWords>;

/** `auto`, `cpu`, or `gpu:<id>` with an id from the status's `gpuDevices`. */
export const SpeechAcceleration = z.union([
  z.literal("auto"),
  z.literal("cpu"),
  z
    .string()
    .regex(/^gpu:.+/)
    .max(500),
]);
export type SpeechAcceleration = z.infer<typeof SpeechAcceleration>;

const SPEECH_MODEL_UNLOAD_TIMEOUTS = [
  "never",
  "immediately",
  "min_2",
  "min_5",
  "min_10",
  "min_15",
  "hour_1",
] as const;
export const SpeechModelUnloadTimeout = z.enum(SPEECH_MODEL_UNLOAD_TIMEOUTS);
export type SpeechModelUnloadTimeout = z.infer<typeof SpeechModelUnloadTimeout>;

/** What a status reads: the known values, or another one of a newer server. */
const SpeechAccelerationRead = z.string();
const SpeechModelUnloadTimeoutRead = forwardCompatibleLiteral(SPEECH_MODEL_UNLOAD_TIMEOUTS);

export const SpeechLanguage = z.string().min(2).max(16);
export const SpeechGpuDevice = z.looseObject({ id: z.string(), name: z.string() });
export const SpeechBenchmarkTier = forwardCompatibleLiteral(["cpu", "accelerated"]);

const finite = z.number().finite();
const SpeechBenchmarkTimes = z.looseObject({
  /** Absent from a legacy server; null when the catalog has no measurement. */
  cpu: finite.nullable().optional(),
  accelerated: finite.nullable(),
});
/** Older servers send `secondsPer30s` as the accelerated number and the CPU time beside it. */
const SpeechBenchmark = z
  .looseObject({
    accuracy: z.record(z.string(), z.looseObject({ grade: z.string(), errorPercent: finite })),
    secondsPer30s: z.union([SpeechBenchmarkTimes, finite.nullable()]),
    cpuSecondsPer30s: finite.nullable().optional(),
  })
  .transform(({ secondsPer30s, cpuSecondsPer30s, ...benchmark }) => ({
    ...benchmark,
    secondsPer30s:
      typeof secondsPer30s === "number" || secondsPer30s === null
        ? {
            accelerated: secondsPer30s,
            ...(cpuSecondsPer30s !== undefined ? { cpu: cpuSecondsPer30s } : {}),
          }
        : secondsPer30s,
  }));

export const EnvironmentSpeechModel = z.looseObject({
  id: SpeechModelId,
  name: z.string(),
  description: z.string(),
  size: finite,
  languages: z.array(z.string()),
  accuracy: finite,
  speed: finite,
  /** Sent when `voice.models` is asked for benchmarks. */
  benchmark: SpeechBenchmark.optional(),
  recommended: z.boolean(),
  supportsStreaming: z.boolean(),
  supportsLanguageDetection: z.boolean(),
  supportsTranslation: z.boolean(),
  active: z.boolean(),
  state: forwardCompatibleLiteral(["downloadable", "downloading", "verifying", "installed"]),
  /** Bytes downloaded so far, while `state` is `downloading`. */
  downloaded: finite.optional(),
  /** The file outside T3 Code's model folder that this model is used from. */
  linkedFrom: z.string().optional(),
});
export type EnvironmentSpeechModel = z.infer<typeof EnvironmentSpeechModel>;

export const EnvironmentSpeechModels = z.looseObject({ models: z.array(EnvironmentSpeechModel) });
export type EnvironmentSpeechModels = z.infer<typeof EnvironmentSpeechModels>;

export const EnvironmentSpeechModelRequest = z.looseObject({ modelId: SpeechModelId });
/** A model file, or a folder to search for them, on the environment's own disk. */
export const EnvironmentSpeechModelLinkRequest = z.looseObject({
  path: TrimmedNonEmptyString.max(4096),
});
export type EnvironmentSpeechModelLinkRequest = z.infer<typeof EnvironmentSpeechModelLinkRequest>;

const SupportedSpeechStatus = z
  .looseObject({
    supported: z.literal(true),
    state: forwardCompatibleLiteral(["missing-model", "ready", "transcribing"]),
    modelId: SpeechModelId,
    model: z.string(),
    size: finite,
    supportsStreaming: z.boolean(),
    supportsBufferedStreaming: z.boolean().optional(),
    /** The server can use a model file from elsewhere on its disk (`voice.linkModels`). */
    supportsModelLinking: z.boolean().optional(),
    supportsTranslation: z.boolean(),
    languages: z.array(z.string()).optional(),
    supportsLanguageDetection: z.boolean().optional(),
    /** `auto`, `cpu` or `gpu:<id>`; another value of a newer server reads as itself. */
    acceleration: SpeechAccelerationRead,
    /** Older servers omit it; it is derived from `acceleration` and `gpuDevices`, as upstream does. */
    benchmarkTier: SpeechBenchmarkTier.optional(),
    modelUnloadTimeout: SpeechModelUnloadTimeoutRead,
    gpuDevices: z.array(SpeechGpuDevice),
  })
  .transform((status) => ({
    ...status,
    benchmarkTier:
      status.benchmarkTier ??
      (status.acceleration === "cpu" ||
      (status.acceleration === "auto" && status.gpuDevices.length === 0)
        ? "cpu"
        : "accelerated"),
  }));

/** `supported: false` with a reason on a machine that cannot transcribe. */
export const EnvironmentSpeechStatus = z.union([
  z.looseObject({ supported: z.literal(false), reason: z.string() }),
  SupportedSpeechStatus,
]);
export type EnvironmentSpeechStatus = z.infer<typeof EnvironmentSpeechStatus>;

export const EnvironmentSpeechTranscriptionResult = z.looseObject({ text: z.string() });
export type EnvironmentSpeechTranscriptionResult = z.infer<
  typeof EnvironmentSpeechTranscriptionResult
>;

export const EnvironmentSpeechAccelerationRequest = z.looseObject({
  acceleration: SpeechAcceleration,
});
export const EnvironmentSpeechModelUnloadTimeoutRequest = z.looseObject({
  timeout: SpeechModelUnloadTimeout,
});

export const SpeechPostProcessingPromptSettings = z.looseObject({
  mode: z.enum(["default", "custom"]),
  customInstructions: z.string().max(10_000),
});

/** A word the person says to flag a spoken correction, such as "sorry". */
export const SpeechCorrectionCue = z.string().max(50);

/** Recognition preferences that travel with every recording. */
export const SpeechTranscriptionOptions = z.looseObject({
  speechLanguage: SpeechLanguage,
  speechTranslateToEnglish: z.boolean(),
  speechCustomWords: SpeechCustomWords,
  speechRemoveFillerWords: z.boolean(),
  speechCorrectionWord: SpeechCorrectionCue.optional(),
  speechSilenceFiltering: z.boolean().default(true),
});
export type SpeechTranscriptionOptions = z.input<typeof SpeechTranscriptionOptions>;

export const SpeechPostProcessingOptions = z.looseObject({
  speechCustomWords: SpeechCustomWords,
  speechPostProcessingPrompt: SpeechPostProcessingPromptSettings,
  speechCorrectionWord: SpeechCorrectionCue.optional(),
});

export const EnvironmentSpeechPostProcessingRequest = z.looseObject({
  options: SpeechPostProcessingOptions,
  transcript: z.string().max(100_000),
  draft: z.looseObject({
    text: z.string().max(100_000),
    selection: z.looseObject({ start: z.number(), end: z.number() }),
  }),
});
export type EnvironmentSpeechPostProcessingRequest = z.input<
  typeof EnvironmentSpeechPostProcessingRequest
>;
export const EnvironmentSpeechPostProcessingResult = z.looseObject({ text: z.string() });
