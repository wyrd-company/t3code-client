// ---
// relationships:
//   implements: library-wire
// ---
import { z } from "zod";
import { T3DecodeError } from "../errors.ts";
import type {
  WebSocketCloseInfo,
  WebSocketConstructor,
  WebSocketLike,
} from "../internal/websocket.ts";
import type { StreamItem } from "../rpc/client.ts";
import { MediaSession } from "./mediaSession.ts";
import { binaryBytes, connectMediaSocket } from "./mediaSocket.ts";

export const PREVIEW_TUNNEL_PATH = "/api/preview/tunnel";
export const PreviewTunnelPort = z.number().int().min(1).max(65_535);
const PreviewTunnelBytes = z.instanceof(Uint8Array);

export interface PreviewTunnelClose {
  readonly code: number;
  readonly reason: string;
}

/** A TCP connection to one preview port on the environment's loopback interface. */
export interface PreviewTunnel extends AsyncIterable<StreamItem<Uint8Array>> {
  readonly closed: Promise<PreviewTunnelClose>;
  send(bytes: Uint8Array): void;
  close(): Promise<void>;
}

class PreviewTunnelSession extends MediaSession<Uint8Array, PreviewTunnelClose> {
  constructor(socket: () => WebSocketLike) {
    super(socket, "preview tunnel", "preview tunnel closed");
  }

  receive(data: unknown): void {
    const decoded = PreviewTunnelBytes.safeParse(binaryBytes(data));
    this.push(
      decoded.success
        ? { kind: "item", value: decoded.data }
        : {
            kind: "decode-error",
            error: new T3DecodeError(PREVIEW_TUNNEL_PATH, decoded.error, data),
          },
    );
  }

  send(bytes: Uint8Array): void {
    this.sendOpen(bytes);
  }

  protected closeDetails(info: WebSocketCloseInfo): PreviewTunnelClose {
    return { code: info.code, reason: info.reason };
  }
}

export function connectPreviewTunnel(
  webSocket: WebSocketConstructor,
  url: URL,
  signal?: AbortSignal,
): Promise<PreviewTunnel> {
  return connectMediaSocket(
    webSocket,
    url,
    "preview tunnel",
    (socket) => new PreviewTunnelSession(socket),
    signal,
  );
}
