// ---
// relationships:
//   implements: library-wire
// ---
/**
 * The messages of the live transcription socket at `GET /ws/voice`. Mirrors
 * `SpeechStreamCommand` and `SpeechStreamEvent` in upstream `packages/contracts/src/speech.ts`.
 */
import { z } from "zod";
import { taggedUnionWithUnknown } from "./common.ts";
import { SpeechTranscriptionOptions } from "./speech.ts";

/** The socket path. */
export const SPEECH_STREAM_PATH = "/ws/voice";
/** The largest binary audio message the server reads: one second of 16 kHz mono Float32 PCM. */
export const SPEECH_STREAM_MAX_CHUNK_BYTES = 16_000 * 4;

/** A text message that the client sends. The first is `start`; `finish` asks for the final text. */
export const SpeechStreamCommand = z.discriminatedUnion("type", [
  z.looseObject({ type: z.literal("start"), options: SpeechTranscriptionOptions }),
  z.looseObject({ type: z.literal("finish") }),
]);
export type SpeechStreamCommand = z.input<typeof SpeechStreamCommand>;

/** The text so far: `committed` does not change again, `tentative` can. */
export const SpeechStreamText = z.looseObject({ committed: z.string(), tentative: z.string() });
export type SpeechStreamText = z.infer<typeof SpeechStreamText>;

/**
 * A text message that the server sends. `ready` answers `start`, `update` answers each audio
 * message, `finished` answers `finish`, and `error` comes before the server closes with 1008.
 */
export const SpeechStreamEvent = taggedUnionWithUnknown("type", [
  z.looseObject({ type: z.literal("ready") }),
  z.looseObject({
    type: z.literal("update"),
    revision: z.number().int(),
    text: SpeechStreamText.nullable(),
  }),
  z.looseObject({ type: z.literal("finished"), text: z.string() }),
  z.looseObject({ type: z.literal("error"), message: z.string() }),
]);
export type SpeechStreamEvent = z.infer<typeof SpeechStreamEvent>;
