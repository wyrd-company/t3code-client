// ---
// relationships:
//   implements: proxy
// ---
import type * as NodeHttp from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";

const NOT_FORWARDED = new Set(["connection", "upgrade", "keep-alive"]);
const NOT_RETURNED = new Set(["connection", "keep-alive", "transfer-encoding"]);

/** The frame options of both sides: no compression and no frame size limit of its own. */
const FRAME_OPTIONS = { perMessageDeflate: false, maxPayload: 0, autoPong: false } as const;

/** The server keeps the Host that the client used, so that its origin checks stay correct. */
function forwardedHeaders(headers: NodeHttp.IncomingHttpHeaders): Record<string, string> {
  const forwarded: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || NOT_FORWARDED.has(key) || key.startsWith("sec-websocket-")) continue;
    forwarded[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return forwarded;
}

/** Sends the server's status, headers and body to the client that it refused. */
function returnRefusal(answer: NodeHttp.IncomingMessage, socket: Duplex): void {
  const lines = [`HTTP/1.1 ${answer.statusCode ?? 502} ${answer.statusMessage ?? ""}`];
  for (let index = 0; index < answer.rawHeaders.length; index += 2) {
    const key = answer.rawHeaders[index]!;
    if (!NOT_RETURNED.has(key.toLowerCase()))
      lines.push(`${key}: ${answer.rawHeaders[index + 1]!}`);
  }
  lines.push("Connection: close");
  socket.write(`${lines.join("\r\n")}\r\n\r\n`);
  answer.on("error", () => socket.destroy());
  answer.pipe(socket);
}

export interface BridgeUpgrade {
  readonly upstream: URL;
  readonly target: string;
  readonly request: NodeHttp.IncomingMessage;
  readonly socket: Duplex;
  readonly head: Buffer;
  /** Receives each socket when it starts, so that shutdown can close it. */
  readonly track: (socket: WebSocket) => void;
  readonly onOpen: (client: WebSocket, server: WebSocket) => void;
  readonly onUnreachable: (code: string) => void;
}

/** Completes the client upgrade only after the server accepts its own upgrade. */
export function upgradeToBridge(options: BridgeUpgrade): void {
  const { request, socket, head, track, onOpen, onUnreachable } = options;
  const base = options.upstream.protocol === "https:" ? "wss:" : "ws:";
  const protocols = request.headers["sec-websocket-protocol"]
    ?.split(",")
    .map((protocol) => protocol.trim());
  let server: WebSocket;
  try {
    server = new WebSocket(`${base}//${options.upstream.host}${options.target}`, protocols, {
      ...FRAME_OPTIONS,
      headers: forwardedHeaders(request.headers),
    });
  } catch {
    socket.destroy();
    return;
  }
  track(server);
  // After the upgrade, the bridge owns the two sockets.
  const endServer = () => server.terminate();
  const endClient = () => socket.destroy();
  socket.on("error", endServer);
  socket.on("close", endServer);
  socket.on("end", endClient);
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (server.readyState !== WebSocket.OPEN) onUnreachable(error.code ?? "upgrade failed");
    socket.destroy();
  });
  server.once("unexpected-response", (_request, answer) => {
    answer.on("close", () => server.terminate());
    returnRefusal(answer, socket);
  });
  server.once("open", () => {
    const clients = new WebSocketServer({
      ...FRAME_OPTIONS,
      noServer: true,
      handleProtocols: () => server.protocol || false,
    });
    clients.handleUpgrade(request, socket, head, (client) => {
      socket.off("error", endServer);
      socket.off("close", endServer);
      socket.off("end", endClient);
      track(client);
      onOpen(client, server);
    });
  });
}
