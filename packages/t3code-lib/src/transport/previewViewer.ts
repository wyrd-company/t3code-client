// ---
// relationships:
//   implements: library-wire
// ---
/**
 * One viewer of a server browser tab, over `/api/preview-stream/ws`. The server keeps
 * one frame on the wire until the viewer acknowledges it. The iterator sends that
 * acknowledgement when the consumer asks for the next item, so that a slow consumer
 * gets only the newest frame.
 */
import { T3DecodeError, T3PreconditionError } from "../errors.ts";
import type {
  WebSocketCloseInfo,
  WebSocketConstructor,
  WebSocketLike,
} from "../internal/websocket.ts";
import type { StreamItem } from "../rpc/client.ts";
import {
  PreviewStreamHostSetup,
  PreviewViewerInput,
  PreviewViewerMessage,
} from "../schemas/previewViewer.ts";
import { MediaSession } from "./mediaSession.ts";
import { binaryBytes, connectMediaSocket, parseText } from "./mediaSocket.ts";

const CLOSE_TAB_GONE = 4404;
const CLOSE_HOST_SETUP = 4503;
const CLOSE_RECONNECT = 1012;
const DECODE_SOURCE = "/api/preview-stream/ws";

export interface PreviewViewerFrame {
  readonly type: "frame";
  /** A JPEG image. */
  readonly bytes: Uint8Array;
}

export type PreviewViewerOutput = PreviewViewerFrame | PreviewViewerMessage;

/** Why the socket ended. A viewer does not reconnect by itself. */
export interface PreviewViewerClose {
  readonly code: number;
  readonly reason: string;
  /** The tab closed, or was never there. */
  readonly tabGone: boolean;
  /** The server asks the viewer to attach again. */
  readonly reconnect: boolean;
  /** What the host needs before its browser can start. */
  readonly hostSetup?: PreviewStreamHostSetup;
}

type Item = StreamItem<PreviewViewerOutput>;

/** Frames and messages in arrival order, until the socket ends. A `break` closes the viewer. */
export interface PreviewViewer extends AsyncIterable<Item> {
  /** Resolves when the socket ends, for any reason. */
  readonly closed: Promise<PreviewViewerClose>;
  /** Validate an input and send it. The server drops it when this viewer only watches. */
  send(input: PreviewViewerInput): void;
  /** Close the socket and end the iteration. A closed viewer stays closed. */
  close(): Promise<void>;
}

class ViewerSession
  extends MediaSession<PreviewViewerOutput, PreviewViewerClose>
  implements PreviewViewer
{
  #frameToAck = false;

  constructor(socket: () => WebSocketLike) {
    super(socket, "preview viewer", "viewer closed");
  }

  receive(data: unknown): void {
    const bytes = binaryBytes(data);
    if (bytes !== undefined) {
      this.push({ kind: "item", value: { type: "frame", bytes } });
      return;
    }
    const raw = parseText(data);
    const decoded = PreviewViewerMessage.safeParse(raw);
    this.push(
      decoded.success
        ? { kind: "item", value: decoded.data }
        : {
            kind: "decode-error",
            error: new T3DecodeError(DECODE_SOURCE, decoded.error, raw),
          },
    );
  }

  send(input: PreviewViewerInput): void {
    const parsed = PreviewViewerInput.safeParse(input);
    if (!parsed.success) {
      throw new T3PreconditionError(`Preview viewer input is invalid: ${parsed.error.message}`);
    }
    this.sendOpen(JSON.stringify(parsed.data));
  }

  protected closeDetails(info: WebSocketCloseInfo): PreviewViewerClose {
    const hostSetup = info.code === CLOSE_HOST_SETUP ? parseHostSetup(info.reason) : undefined;
    return {
      code: info.code,
      reason: info.reason,
      tabGone: info.code === CLOSE_TAB_GONE,
      reconnect: info.code === CLOSE_RECONNECT,
      ...(hostSetup === undefined ? {} : { hostSetup }),
    };
  }

  /** A call that waits also asks for more, so it acknowledges a frame that another call took. */
  protected override beforeTake(): void {
    if (!this.#frameToAck) return;
    this.#frameToAck = false;
    if (this.isOpen()) this.sendOpen(JSON.stringify({ type: "ack" }));
  }

  protected override afterTake(item: Item): void {
    if (item.kind === "item" && "bytes" in item.value) this.#frameToAck = true;
  }
}

/** Opens the socket at `url`, which carries its credential. Errors never name the URL. */
export function connectPreviewViewer(
  webSocket: WebSocketConstructor,
  url: URL,
  signal?: AbortSignal,
): Promise<PreviewViewer> {
  return connectMediaSocket(
    webSocket,
    url,
    "preview viewer",
    (socket) => new ViewerSession(socket),
    signal,
  );
}

function parseHostSetup(reason: string): PreviewStreamHostSetup | undefined {
  const decoded = PreviewStreamHostSetup.safeParse(parseText(reason));
  return decoded.success ? decoded.data : undefined;
}
