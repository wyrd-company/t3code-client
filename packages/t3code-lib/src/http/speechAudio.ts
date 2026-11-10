// ---
// relationships:
//   implements: library-transport
// ---
/**
 * The body of `voice.transcribe` and `voice.transcribeCloud`: a four-byte little-endian length,
 * the UTF-8 JSON of the transcription options, then 16 kHz mono Float32 PCM. Mirrors
 * `encodeSpeechPcmRequest` in upstream `packages/shared/src/speech.ts`.
 */
import { T3PreconditionError } from "../errors.ts";
import { SpeechTranscriptionOptions } from "../schemas/speech.ts";

/** The largest options JSON the server reads. */
export const SPEECH_MAX_OPTIONS_BYTES = 128_000;

/** The default recognition preferences, as upstream's clients send them. */
export const DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS = {
  speechLanguage: "auto",
  speechTranslateToEnglish: false,
  speechCustomWords: [],
  speechRemoveFillerWords: true,
  speechSilenceFiltering: true,
} as const satisfies SpeechTranscriptionOptions;

/**
 * Frames 16 kHz mono Float32 `pcm` with its recognition options as the body of `voice.transcribe`
 * or `voice.transcribeCloud`. Raises `T3PreconditionError` for invalid options, for audio that is
 * not whole samples and for options over `SPEECH_MAX_OPTIONS_BYTES`.
 */
export function encodeSpeechPcmRequest(
  pcm: Uint8Array,
  options: SpeechTranscriptionOptions = DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS,
): Uint8Array<ArrayBuffer> {
  const parsed = SpeechTranscriptionOptions.safeParse(options);
  if (!parsed.success)
    throw new T3PreconditionError(`Speech options are invalid: ${parsed.error.message}`);
  if (pcm.byteLength === 0 || pcm.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0)
    throw new T3PreconditionError("Speech audio must be one or more Float32 samples.");
  const metadata = new TextEncoder().encode(JSON.stringify(parsed.data));
  if (metadata.byteLength > SPEECH_MAX_OPTIONS_BYTES)
    throw new T3PreconditionError("Speech options are too large.");
  const body = new Uint8Array(4 + metadata.byteLength + pcm.byteLength);
  new DataView(body.buffer).setUint32(0, metadata.byteLength, true);
  body.set(metadata, 4);
  body.set(pcm, 4 + metadata.byteLength);
  return body;
}
