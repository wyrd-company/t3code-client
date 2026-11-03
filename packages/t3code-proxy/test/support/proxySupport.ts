// ---
// relationships:
//   verifies: proxy
// ---
import * as NodeHttp from "node:http";
import * as NodeNet from "node:net";
import { afterEach } from "vite-plus/test";
import { WebSocket, WebSocketServer } from "ws";
import { startProxy, type ProxyService } from "../../src/service.ts";

export function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

export const cleanups: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup();
});

export interface Upstream {
  readonly url: string;
  readonly port: number;
  readonly server: NodeHttp.Server;
  readonly sockets: WebSocketServer;
  /** The latest upgrade request of each path. */
  readonly upgrades: NodeHttp.IncomingMessage[];
}

export async function startUpstream(
  handler: NodeHttp.RequestListener = (_request, response) => response.end("ok"),
  options: {
    verifyClient?: (done: (accept: boolean) => void) => void;
    autoPong?: boolean;
    perMessageDeflate?: boolean;
  } = {},
): Promise<Upstream> {
  const upgrades: NodeHttp.IncomingMessage[] = [];
  const server = NodeHttp.createServer(handler);
  const sockets = new WebSocketServer({
    server,
    maxPayload: 0,
    autoPong: options.autoPong ?? true,
    perMessageDeflate: options.perMessageDeflate ?? false,
    handleProtocols: (protocols) => [...protocols].at(-1) ?? false,
    verifyClient: (info, done) => {
      upgrades.push(info.req);
      if (options.verifyClient)
        options.verifyClient((accept) => done(accept, 426, "Upgrade Required"));
      else done(true);
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as NodeNet.AddressInfo;
  cleanups.push(async () => {
    for (const client of sockets.clients) client.terminate();
    for (const request of upgrades) request.socket.destroy();
    sockets.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return { url: `http://127.0.0.1:${port}`, port, server, sockets, upgrades };
}

export async function startFor(
  url: string,
  lines: string[] = [],
): Promise<ProxyService & { port: number }> {
  const service = await startProxy(
    {
      upstream: new URL(url),
      host: "127.0.0.1",
      users: [
        { name: "Alice", port: 0 },
        { name: "Sam", port: 0 },
      ],
    },
    (line) => lines.push(line),
  );
  cleanups.push(() => service.close());
  return Object.assign(service, { port: service.listeners[0]!.port });
}

export function open(
  port: number,
  path = "/ws",
  protocols?: string[],
  headers?: Record<string, string>,
) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, protocols, {
    maxPayload: 0,
    ...(headers ? { headers } : {}),
  });
  cleanups.push(() => socket.terminate());
  return new Promise<WebSocket>((resolve, reject) => {
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
    socket.once("unexpected-response", (_request, answer) =>
      reject(new Error(`status ${answer.statusCode}`)),
    );
  });
}

export const nextConnection = (upstream: Upstream) =>
  new Promise<WebSocket>((resolve) => upstream.sockets.once("connection", resolve));

export const nextMessage = (socket: WebSocket) =>
  new Promise<{ data: Buffer; isBinary: boolean }>((resolve) => {
    socket.once("message", (data, isBinary) => resolve({ data: data as Buffer, isBinary }));
  });

export const closed = (socket: WebSocket) =>
  new Promise<{ code: number; reason: string }>((resolve) => {
    socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });

export async function connectPair(upstream: Upstream, port: number) {
  const accepted = nextConnection(upstream);
  const client = await open(port);
  const server = await accepted;
  return { client, server };
}

export const dispatchFrame = (text: string, more: object = {}) =>
  JSON.stringify({
    _tag: "Request",
    id: "1",
    tag: "orchestration.dispatchCommand",
    payload: { type: "message.dispatch", text, ...more },
    headers: [],
  });

export function fetchRaw(port: number, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = NodeNet.connect(port, "127.0.0.1", () => socket.write(request));
    let answer = "";
    socket.on("data", (chunk) => (answer += chunk.toString()));
    socket.on("close", () => resolve(answer));
    socket.on("error", reject);
    cleanups.push(() => void socket.destroy());
  });
}

export const upgradeRequest = (path: string, host = "app.example.test") =>
  `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`;

export function requestEnded(upstream: Upstream): Promise<void> {
  const request = upstream.upgrades.at(-1)!;
  return new Promise((resolve) => {
    request.socket.once("end", () => resolve());
    // The upgrade holds the socket paused, and a paused socket does not see its peer leave.
    request.socket.resume();
  });
}
