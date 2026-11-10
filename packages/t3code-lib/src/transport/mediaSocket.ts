// ---
// relationships:
//   implements: library-wire
// ---
/**
 * The open handshake of a socket that carries its credential in its URL as a ticket for the
 * `media` use: the preview viewer and live transcription. One session owns one socket and does
 * not reconnect.
 */
import { T3InterruptedError } from "../errors.ts";
import {
  openWebSocket,
  terminateWebSocket,
  type WebSocketCloseInfo,
  type WebSocketConstructor,
  type WebSocketLike,
} from "../internal/websocket.ts";
import { closeError } from "./socketClose.ts";

/** What a session does with its socket's messages and its end. */
export interface MediaSocketSession {
  receive(data: unknown): void;
  end(info: WebSocketCloseInfo): void;
}

/**
 * Opens the socket at `url` and resolves with the session once it is open. Errors name `label`
 * and never the URL, which holds the ticket.
 */
export function connectMediaSocket<S extends MediaSocketSession>(
  webSocket: WebSocketConstructor,
  url: URL,
  label: string,
  createSession: (socket: () => WebSocketLike) => S,
  signal?: AbortSignal,
): Promise<S> {
  const aborted = () => new T3InterruptedError(`The ${label} did not open: the signal is aborted.`);
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(aborted());
      return;
    }
    let opened = false;
    const session = createSession(() => socket);
    const onAbort = () => {
      reject(aborted());
      terminateWebSocket(socket);
    };
    const socket = openWebSocket(webSocket, url.toString(), undefined, {
      onOpen: () => {
        opened = true;
        signal?.removeEventListener("abort", onAbort);
        resolve(session);
      },
      onMessage: (data) => session.receive(data),
      onError: () => {},
      onClose: (info) => {
        signal?.removeEventListener("abort", onAbort);
        session.end(info);
        if (!opened) reject(closeError(info, false).error);
      },
    });
    (socket as { binaryType?: string }).binaryType = "arraybuffer";
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** The bytes of a binary message, or undefined for a text message. */
export function binaryBytes(data: unknown): Uint8Array | undefined {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return undefined;
}

/** Text that is not JSON stays a string, which the schema then refuses. */
export function parseText(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}
