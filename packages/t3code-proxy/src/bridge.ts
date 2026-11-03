// ---
// relationships:
//   implements: proxy
// ---
import type { RawData, WebSocket } from "ws";

/** Unsent bytes at which the source stops reading, so that a slow peer slows its sender. */
const HIGH_WATER_BYTES = 1024 * 1024;

/** The close codes that the WebSocket protocol allows an endpoint to send. */
function canSendCloseCode(code: number): boolean {
  return (
    (code >= 1000 && code <= 1014 && ![1004, 1005, 1006].includes(code)) ||
    (code >= 3000 && code <= 4999)
  );
}

function asBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  return Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
}

function forward(
  from: WebSocket,
  to: WebSocket,
  transformText: (frame: Buffer) => Buffer | string,
): void {
  let unsent = 0;
  let paused = false;
  from.on("message", (data, isBinary) => {
    const bytes = asBuffer(data);
    const frame = isBinary ? bytes : transformText(bytes);
    const size = frame.length;
    unsent += size;
    if (!paused && unsent >= HIGH_WATER_BYTES) {
      paused = true;
      from.pause();
    }
    to.send(frame, { binary: isBinary }, () => {
      unsent -= size;
      if (paused && unsent < HIGH_WATER_BYTES) {
        paused = false;
        from.resume();
      }
    });
  });
  from.on("ping", (data) => to.ping(data));
  from.on("pong", (data) => to.pong(data));
  from.on("close", (code, reason) => {
    if (canSendCloseCode(code)) to.close(code, reason);
    else to.close();
  });
  // A socket error is followed by its close event, which closes the other side.
  from.on("error", () => undefined);
}

/** Bridges one client and its server connection. Only client text frames can change. */
export function bridge(
  client: WebSocket,
  server: WebSocket,
  rewriteClientText: (frame: string) => string | undefined,
): void {
  forward(client, server, (frame) => rewriteClientText(frame.toString()) ?? frame);
  forward(server, client, (frame) => frame);
}
