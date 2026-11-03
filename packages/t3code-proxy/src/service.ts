// ---
// relationships:
//   implements: proxy
// ---
import * as NodeHttp from "node:http";
import type * as NodeNet from "node:net";
import type { Duplex } from "node:stream";
import { createProxyServer } from "httpxy";
import type { WebSocket } from "ws";
import { bridge } from "./bridge.ts";
import type { ProxyConfig, ProxyUser } from "./config.ts";
import { rewriteFrame } from "./frames.ts";
import { upgradeToBridge } from "./upgrade.ts";

/** How long a close handshake can take at shutdown before the socket ends. */
const SHUTDOWN_GRACE_MS = 1_000;

export interface ProxyService {
  readonly listeners: readonly ProxyUser[];
  close(): Promise<void>;
}

type Log = (line: string) => void;

interface Listener {
  readonly port: number;
  close(): Promise<void>;
}

const webSocketTarget = (request: NodeHttp.IncomingMessage): string | undefined => {
  if (request.headers.upgrade?.toLowerCase() !== "websocket") return undefined;
  const url = URL.parse(request.url ?? "", "http://proxy.invalid");
  return url?.pathname === "/ws" ? `${url.pathname}${url.search}` : undefined;
};

const errorCode = (error: Error): string =>
  (error as NodeJS.ErrnoException).code ?? "unknown error";

async function listen(
  config: ProxyConfig,
  user: ProxyUser,
  names: readonly string[],
  log: Log,
): Promise<Listener> {
  const identity = { name: user.name, names };
  const sockets = new Set<Duplex>();
  const webSockets = new Set<WebSocket>();
  const trackSocket = (socket: Duplex) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  };
  const trackWebSocket = (socket: WebSocket) => {
    webSockets.add(socket);
    socket.once("close", () => webSockets.delete(socket));
  };

  // A new upstream connection per request, so that a pooled socket that the server closed cannot
  // turn into a 502.
  const forwarder = createProxyServer({ target: config.upstream.href, agent: false });
  forwarder.on("error", (error, _request, answer) => {
    log(`${user.name} upstream unreachable: ${errorCode(error)}`);
    if (answer instanceof NodeHttp.ServerResponse && !answer.headersSent) {
      answer.writeHead(502).end();
    } else {
      answer?.destroy();
    }
  });
  forwarder.on("proxyRes", (_answer, _request, response) => {
    // The forwarder sets the headers in this tick. A stream can wait a long time for its first bytes.
    queueMicrotask(() => {
      if (!response.headersSent && !response.destroyed) response.flushHeaders();
    });
  });
  forwarder.on("open", trackSocket);

  // The server's own limits apply to a slow request, not a second limit in this service.
  const server = NodeHttp.createServer({ requestTimeout: 0 }, (request, response) => {
    void forwarder.web(request, response).catch(() => response.destroy());
  });
  server.on("connection", (socket: NodeNet.Socket) => trackSocket(socket));
  server.on("upgrade", (request, socket: NodeNet.Socket, head) => {
    const target = webSocketTarget(request);
    if (target === undefined) {
      void forwarder.ws(request, socket, {}, head).catch(() => socket.destroy());
      return;
    }
    upgradeToBridge({
      upstream: config.upstream,
      target,
      request,
      socket,
      head,
      track: trackWebSocket,
      onUnreachable: (code) => log(`${user.name} upstream unreachable: ${code}`),
      onOpen: (client, upstream) =>
        bridge(client, upstream, (frame) => {
          const { text, commands } = rewriteFrame(frame, identity);
          for (const command of commands) log(`${user.name} ${command}`);
          return text;
        }),
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(user.port, config.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as NodeNet.AddressInfo;
  log(`${user.name} listening on ${address.address}:${address.port}`);

  return {
    port: address.port,
    close: async () => {
      const stopped = new Promise<void>((resolve) => server.close(() => resolve()));
      const open = [...webSockets];
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, SHUTDOWN_GRACE_MS);
        let remaining = open.length;
        const closed = () => {
          remaining -= 1;
          if (remaining > 0) return;
          clearTimeout(timer);
          resolve();
        };
        if (remaining === 0) closed();
        for (const socket of open) {
          socket.once("close", closed);
          if (socket.readyState === socket.OPEN) socket.close(1001);
          else socket.terminate();
        }
      });
      for (const socket of webSockets) socket.terminate();
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      await stopped;
    },
  };
}

/** Starts one listener for each person. If one cannot listen, none stay open. */
export async function startProxy(config: ProxyConfig, log: Log): Promise<ProxyService> {
  const names = config.users.map((user) => user.name);
  const started = await Promise.allSettled(
    config.users.map((user) => listen(config, user, names, log)),
  );
  const listeners = started.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const close = async () => {
    await Promise.all(listeners.map((listener) => listener.close()));
  };
  const failure = started.find((result) => result.status === "rejected");
  if (failure !== undefined) {
    await close();
    throw failure.reason;
  }
  return {
    listeners: config.users.map((user, index) => ({
      name: user.name,
      port: listeners[index]!.port,
    })),
    close,
  };
}
