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
import {
  T3ConnectionError,
  T3DecodeError,
  T3InterruptedError,
  T3PreconditionError,
} from "../errors.ts";
import {
  closeWebSocket,
  openWebSocket,
  terminateWebSocket,
  type WebSocketCloseInfo,
  type WebSocketConstructor,
  type WebSocketLike,
} from "../internal/websocket.ts";
import type { StreamItem } from "../rpc/client.ts";
import {
  PreviewStreamHostSetup,
  PreviewViewerInput,
  PreviewViewerMessage,
} from "../schemas/previewViewer.ts";
import { closeError } from "./socketClose.ts";

const SOCKET_OPEN = 1;
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

class ViewerSession implements PreviewViewer {
  readonly #socket: () => WebSocketLike;
  readonly #items: Item[] = [];
  #waiting: (() => void)[] = [];
  #ended = false;
  #frameToAck = false;
  #resolveClosed!: (close: PreviewViewerClose) => void;
  readonly closed = new Promise<PreviewViewerClose>((resolve) => {
    this.#resolveClosed = resolve;
  });

  constructor(socket: () => WebSocketLike) {
    this.#socket = socket;
  }

  receive(data: unknown): void {
    const bytes = binaryBytes(data);
    if (bytes !== undefined) {
      this.#push({ kind: "item", value: { type: "frame", bytes } });
      return;
    }
    const raw = parseText(data);
    const decoded = PreviewViewerMessage.safeParse(raw);
    this.#push(
      decoded.success
        ? { kind: "item", value: decoded.data }
        : { kind: "decode-error", error: new T3DecodeError(DECODE_SOURCE, decoded.error, raw) },
    );
  }

  end(info: WebSocketCloseInfo): void {
    this.#ended = true;
    this.#resolveClosed(closeDetails(info));
    this.#wakeAll();
  }

  send(input: PreviewViewerInput): void {
    const parsed = PreviewViewerInput.safeParse(input);
    if (!parsed.success) {
      throw new T3PreconditionError(`Preview viewer input is invalid: ${parsed.error.message}`);
    }
    this.#sendJson(parsed.data);
  }

  async close(): Promise<void> {
    await closeWebSocket(this.#socket(), "viewer closed");
  }

  [Symbol.asyncIterator](): AsyncIterator<Item> {
    return {
      next: () => this.#next(),
      return: async () => {
        await this.close();
        return { done: true, value: undefined };
      },
    };
  }

  async #next(): Promise<IteratorResult<Item>> {
    this.#acknowledgeFrame();
    while (this.#items.length === 0) {
      if (this.#ended) return { done: true, value: undefined };
      await new Promise<void>((resolve) => {
        this.#waiting.push(resolve);
      });
    }
    const item = this.#items.shift() as Item;
    if (item.kind === "item" && "bytes" in item.value) this.#frameToAck = true;
    return { done: false, value: item };
  }

  #acknowledgeFrame(): void {
    if (!this.#frameToAck) return;
    this.#frameToAck = false;
    if (this.#socket().readyState === SOCKET_OPEN) this.#sendJson({ type: "ack" });
  }

  #sendJson(message: { readonly type: string }): void {
    const socket = this.#socket();
    if (socket.readyState !== SOCKET_OPEN) {
      throw new T3ConnectionError("closed", "The preview viewer socket is closed.");
    }
    socket.send(JSON.stringify(message));
  }

  #push(item: Item): void {
    this.#items.push(item);
    this.#wakeAll();
  }

  #wakeAll(): void {
    const waiting = this.#waiting;
    this.#waiting = [];
    for (const wake of waiting) wake();
  }
}

/** Opens the socket at `url`, which carries its credential. Errors never name the URL. */
export function connectPreviewViewer(
  webSocket: WebSocketConstructor,
  url: URL,
  signal?: AbortSignal,
): Promise<PreviewViewer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new T3InterruptedError("The preview viewer did not open: the signal is aborted."));
      return;
    }
    let opened = false;
    const viewer = new ViewerSession(() => socket);
    const onAbort = () => {
      reject(new T3InterruptedError("The preview viewer did not open: the signal is aborted."));
      terminateWebSocket(socket);
    };
    const socket = openWebSocket(webSocket, url.toString(), undefined, {
      onOpen: () => {
        opened = true;
        signal?.removeEventListener("abort", onAbort);
        resolve(viewer);
      },
      onMessage: (data) => viewer.receive(data),
      onError: () => {},
      onClose: (info) => {
        signal?.removeEventListener("abort", onAbort);
        viewer.end(info);
        if (!opened) reject(closeError(info, false).error);
      },
    });
    (socket as { binaryType?: string }).binaryType = "arraybuffer";
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function binaryBytes(data: unknown): Uint8Array | undefined {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return undefined;
}

/** Text that is not JSON stays a string, which the schema then refuses. */
function parseText(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

function closeDetails(info: WebSocketCloseInfo): PreviewViewerClose {
  const hostSetup = info.code === CLOSE_HOST_SETUP ? parseHostSetup(info.reason) : undefined;
  return {
    code: info.code,
    reason: info.reason,
    tabGone: info.code === CLOSE_TAB_GONE,
    reconnect: info.code === CLOSE_RECONNECT,
    ...(hostSetup === undefined ? {} : { hostSetup }),
  };
}

function parseHostSetup(reason: string): PreviewStreamHostSetup | undefined {
  const decoded = PreviewStreamHostSetup.safeParse(parseText(reason));
  return decoded.success ? decoded.data : undefined;
}
