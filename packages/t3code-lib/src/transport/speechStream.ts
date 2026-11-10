// ---
// relationships:
//   implements: library-wire
// ---
/**
 * One live transcription over `/ws/voice`. The client sends `start` with its recognition
 * options, then 16 kHz mono Float32 PCM in binary messages, then `finish`. The server answers
 * each in arrival order and closes the socket after `finished` or `error`.
 */
import { T3DecodeError, T3PreconditionError } from "../errors.ts";
import { SPEECH_MAX_OPTIONS_BYTES } from "../http/speechAudio.ts";
import type {
  WebSocketCloseInfo,
  WebSocketConstructor,
  WebSocketLike,
} from "../internal/websocket.ts";
import type { StreamItem } from "../rpc/client.ts";
import { SpeechTranscriptionOptions } from "../schemas/speech.ts";
import {
  SPEECH_STREAM_MAX_CHUNK_BYTES,
  SPEECH_STREAM_PATH,
  SpeechStreamEvent,
} from "../schemas/speechStream.ts";
import { MediaSession } from "./mediaSession.ts";
import { binaryBytes, connectMediaSocket, parseText } from "./mediaSocket.ts";

/** Why the socket ended. 1000 follows `finished`; 1008 follows `error`. */
export interface SpeechStreamClose {
  readonly code: number;
  readonly reason: string;
}

type Item = StreamItem<SpeechStreamEvent>;

/** Server events in arrival order, until the socket ends. A `break` closes the stream. */
export interface SpeechStream extends AsyncIterable<Item> {
  /** Resolves when the socket ends, for any reason. */
  readonly closed: Promise<SpeechStreamClose>;
  /**
   * Send whole 16 kHz mono Float32 samples, at most `SPEECH_STREAM_MAX_CHUNK_BYTES` in one call.
   * The server answers each call with an `update`.
   */
  sendAudio(pcm: Uint8Array): void;
  /** Ask for the final text. The server answers with `finished` and closes the socket. */
  finish(): void;
  /** Close the socket and end the iteration. A closed stream stays closed. */
  close(): Promise<void>;
}

/**
 * The `start` command of `options`. Raises `T3PreconditionError` for invalid options and for
 * options over `SPEECH_MAX_OPTIONS_BYTES`.
 */
export function speechStreamStart(options: SpeechTranscriptionOptions): string {
  const parsed = SpeechTranscriptionOptions.safeParse(options);
  if (!parsed.success) {
    throw new T3PreconditionError(`Speech options are invalid: ${parsed.error.message}`);
  }
  const text = JSON.stringify({ type: "start", options: parsed.data });
  if (new TextEncoder().encode(text).byteLength > SPEECH_MAX_OPTIONS_BYTES) {
    throw new T3PreconditionError("Speech options are too large.");
  }
  return text;
}

class SpeechSession
  extends MediaSession<SpeechStreamEvent, SpeechStreamClose>
  implements SpeechStream
{
  constructor(socket: () => WebSocketLike) {
    super(socket, "speech stream", "speech stream closed");
  }

  receive(data: unknown): void {
    // The server sends no binary message, so one is refused like any other unknown message.
    const raw = binaryBytes(data) === undefined ? parseText(data) : data;
    const decoded = SpeechStreamEvent.safeParse(raw);
    this.push(
      decoded.success
        ? { kind: "item", value: decoded.data }
        : {
            kind: "decode-error",
            error: new T3DecodeError(SPEECH_STREAM_PATH, decoded.error, raw),
          },
    );
  }

  sendAudio(pcm: Uint8Array): void {
    if (pcm.byteLength === 0 || pcm.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
      throw new T3PreconditionError("Speech audio must be one or more Float32 samples.");
    }
    if (pcm.byteLength > SPEECH_STREAM_MAX_CHUNK_BYTES) {
      throw new T3PreconditionError(
        `Speech audio is over ${SPEECH_STREAM_MAX_CHUNK_BYTES} bytes in one message.`,
      );
    }
    this.sendOpen(pcm);
  }

  finish(): void {
    this.sendOpen(JSON.stringify({ type: "finish" }));
  }

  sendStart(start: string): void {
    this.sendOpen(start);
  }

  protected closeDetails(info: WebSocketCloseInfo): SpeechStreamClose {
    return { code: info.code, reason: info.reason };
  }
}

/**
 * Opens the socket at `url`, which carries its credential, and sends `start`, the text from
 * `speechStreamStart`. Errors never name the URL.
 */
export async function connectSpeechStream(
  webSocket: WebSocketConstructor,
  url: URL,
  start: string,
  signal?: AbortSignal,
): Promise<SpeechStream> {
  const stream = await connectMediaSocket(
    webSocket,
    url,
    "speech stream",
    (socket) => new SpeechSession(socket),
    signal,
  );
  stream.sendStart(start);
  return stream;
}
