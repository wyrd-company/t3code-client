// ---
// relationships:
//   verifies: proxy
// ---
import * as NodeCrypto from "node:crypto";
import type * as NodeHttp from "node:http";
import * as NodeNet from "node:net";
import { describe, expect, it } from "vite-plus/test";
import { startProxy } from "./service.ts";
import {
  cleanups,
  closed,
  connectPair,
  dispatchFrame,
  fetchRaw,
  nextConnection,
  nextMessage,
  open,
  signal,
  startFor,
  startUpstream,
  upgradeRequest,
} from "../test/support/proxySupport.ts";

describe("unchanged HTTP traffic", () => {
  it("passes the method, path, query, body, Host and forwarded headers", async () => {
    let seen: {
      method?: string;
      url?: string;
      headers?: NodeHttp.IncomingHttpHeaders;
      body?: string;
    };
    const upstream = await startUpstream((request, response) => {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        seen = { method: request.method!, url: request.url!, headers: request.headers, body };
        response.writeHead(201, "Made", { "x-answer": "1", "set-cookie": ["a=1", "b=2"] });
        response.end("done");
      });
    });
    const { port } = await startFor(upstream.url);
    const answer = await fetch(`http://127.0.0.1:${port}/mcp?a=1&b=two`, {
      method: "POST",
      body: "request body",
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "app.example.test",
        "x-forwarded-for": "192.0.2.1",
      },
    });
    expect(answer.status).toBe(201);
    expect(await answer.text()).toBe("done");
    expect(answer.headers.get("x-answer")).toBe("1");
    expect(answer.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
    expect(seen!).toMatchObject({ method: "POST", url: "/mcp?a=1&b=two", body: "request body" });
    expect(seen!.headers).toMatchObject({
      host: `127.0.0.1:${port}`,
      "x-forwarded-proto": "https",
      "x-forwarded-host": "app.example.test",
      "x-forwarded-for": "192.0.2.1",
    });
  });
  it("adds no forwarded headers that the client did not send", async () => {
    let headers: NodeHttp.IncomingHttpHeaders = {};
    const upstream = await startUpstream((request, response) => {
      headers = request.headers;
      response.end();
    });
    const { port } = await startFor(upstream.url);
    await fetch(`http://127.0.0.1:${port}/`);
    expect(Object.keys(headers).filter((key) => key.startsWith("x-forwarded-"))).toEqual([]);
  });
  it("keeps the Host of a request with another hostname", async () => {
    let host: string | undefined;
    const upstream = await startUpstream((request, response) => {
      host = request.headers.host;
      response.end();
    });
    const { port } = await startFor(upstream.url);
    await fetchRaw(port, "GET / HTTP/1.1\r\nHost: app.example.test\r\nConnection: close\r\n\r\n");
    expect(host).toBe("app.example.test");
  });
  it("sends the headers of a stream before its first bytes", async () => {
    let finish!: () => void;
    const upstream = await startUpstream((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.flushHeaders();
      finish = () => response.end();
    });
    const { port } = await startFor(upstream.url);
    const answer = await fetch(`http://127.0.0.1:${port}/mcp`);
    expect(answer.headers.get("content-type")).toBe("text/event-stream");
    finish();
    await answer.text();
  });
  it("does not buffer a streamed response", async () => {
    let finish!: () => void;
    const upstream = await startUpstream((_request, response) => {
      response.write("first");
      finish = () => response.end("last");
    });
    const { port } = await startFor(upstream.url);
    const answer = await fetch(`http://127.0.0.1:${port}/`);
    const reader = answer.body!.getReader();
    const first = await reader.read();
    expect(Buffer.from(first.value!).toString()).toBe("first");
    finish();
    const rest = await reader.read();
    expect(Buffer.from(rest.value!).toString()).toBe("last");
  });
  it("uses a new server connection for each request", async () => {
    const upstream = await startUpstream();
    let connections = 0;
    upstream.server.on("connection", () => (connections += 1));
    const { port } = await startFor(upstream.url);
    await (await fetch(`http://127.0.0.1:${port}/`)).text();
    await (await fetch(`http://127.0.0.1:${port}/`)).text();
    expect(connections).toBe(2);
  });
  it("answers HEAD and 304 with no body", async () => {
    const upstream = await startUpstream((request, response) => {
      if (request.method === "HEAD") response.writeHead(200, { "content-length": "5" }).end();
      else response.writeHead(304).end();
    });
    const { port } = await startFor(upstream.url);
    const head = await fetch(`http://127.0.0.1:${port}/`, { method: "HEAD" });
    expect(head.headers.get("content-length")).toBe("5");
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(304);
  });
  it("answers 502 when the server cannot be reached", async () => {
    const lines: string[] = [];
    const { port } = await startFor("http://127.0.0.1:1", lines);
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(502);
    expect(lines).toContain("Alice upstream unreachable: ECONNREFUSED");
  });
  it("ends the response when the server fails during the body", async () => {
    const upstream = await startUpstream((_request, response) => {
      response.write("part");
      setImmediate(() => response.destroy());
    });
    const { port } = await startFor(upstream.url);
    const answer = await fetch(`http://127.0.0.1:${port}/`);
    await expect(answer.text()).rejects.toThrow();
  });
  it("passes a WebSocket upgrade on another path with no change", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const accepted = nextConnection(upstream);
    const client = await open(port, "/other?a=1");
    const server = await accepted;
    const received = nextMessage(server);
    const frame = dispatchFrame("hi");
    client.send(frame);
    expect((await received).data.toString()).toBe(frame);
    expect(upstream.upgrades.at(-1)?.url).toBe("/other?a=1");
    const answer = nextMessage(client);
    server.send("reply");
    expect((await answer).data.toString()).toBe("reply");
  });
  it("closes another upgrade when the server cannot be reached", async () => {
    const { port } = await startFor("http://127.0.0.1:1");
    await expect(open(port, "/other")).rejects.toThrow();
  });
});

describe("shutdown", () => {
  it("closes the listeners and all connections", async () => {
    const upstream = await startUpstream((_request, response) => {
      response.write("stream");
    });
    const service = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, service.port);
    const otherAccepted = nextConnection(upstream);
    const other = await open(service.port, "/other");
    const otherServer = await otherAccepted;
    const stream = await fetch(`http://127.0.0.1:${service.port}/`);
    const body = stream.text();
    const ends = [closed(client), closed(server), closed(other), closed(otherServer)];
    const started = Date.now();
    await service.close();
    expect(Date.now() - started).toBeLessThan(3_000);
    const [clientEnd, serverEnd] = await Promise.all(ends);
    expect(clientEnd?.code).toBe(1001);
    expect(serverEnd?.code).toBe(1001);
    await expect(body).rejects.toThrow();
    await expect(fetch(`http://127.0.0.1:${service.port}/`)).rejects.toThrow();
  });
  it("ends an upgrade that is waiting for the server", async () => {
    const reached = signal();
    const upstream = await startUpstream(undefined, {
      verifyClient: () => reached.resolve(),
    });
    const service = await startFor(upstream.url);
    const pending = fetchRaw(service.port, upgradeRequest("/ws"));
    await reached.promise;
    const started = Date.now();
    await service.close();
    expect(Date.now() - started).toBeLessThan(900);
    expect(await pending).toBe("");
  });
  it("ends a client that does not answer the close handshake", async () => {
    const upstream = await startUpstream();
    const service = await startFor(upstream.url);
    const { client } = await connectPair(upstream, service.port);
    client.pause();
    const started = Date.now();
    await service.close();
    expect(Date.now() - started).toBeLessThan(3_000);
    client.resume();
  });
  it("ends a server that does not answer the close handshake", async () => {
    const upstream = await startUpstream();
    upstream.server.removeAllListeners("upgrade");
    const ended = new Promise<void>((resolve) => {
      upstream.server.on("upgrade", (request, socket) => {
        const accept = NodeCrypto.createHash("sha1")
          .update(
            `${String(request.headers["sec-websocket-key"])}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`,
          )
          .digest("base64");
        socket.write(
          `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
        );
        socket.on("end", () => resolve());
        socket.on("error", () => resolve());
        socket.resume();
        cleanups.push(() => void socket.destroy());
      });
    });
    const service = await startFor(upstream.url);
    await open(service.port);
    await service.close();
    await ended;
  });
  it("closes every other listener when one cannot listen", async () => {
    const held = NodeNet.createServer();
    await new Promise<void>((resolve) => held.listen(0, "127.0.0.1", () => resolve()));
    cleanups.push(() => void held.close());
    const { port } = held.address() as NodeNet.AddressInfo;
    const free = NodeNet.createServer();
    await new Promise<void>((resolve) => free.listen(0, "127.0.0.1", () => resolve()));
    const freePort = (free.address() as NodeNet.AddressInfo).port;
    await new Promise((resolve) => free.close(resolve));
    await expect(
      startProxy(
        {
          upstream: new URL("http://127.0.0.1:1"),
          host: "127.0.0.1",
          users: [
            { name: "Alice", port: freePort },
            { name: "Sam", port },
          ],
        },
        () => undefined,
      ),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });
    await expect(fetch(`http://127.0.0.1:${freePort}/`)).rejects.toThrow();
  });
});

describe("diagnostics", () => {
  it("names the person, tag and command, and holds no text, token, cookie or query", async () => {
    const lines: string[] = [];
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url, lines);
    const accepted = nextConnection(upstream);
    const client = await open(port, "/ws?wsToken=SECRET_TICKET", undefined, {
      Cookie: "session=SECRET_COOKIE",
      Authorization: "Bearer SECRET_TOKEN",
    });
    const server = await accepted;
    const received = nextMessage(server);
    client.send(dispatchFrame("SECRET_TEXT"));
    await received;
    const launch = nextMessage(server);
    client.send(
      JSON.stringify({
        _tag: "Request",
        tag: "orchestration.launchThread",
        payload: { initialMessage: { text: "SECRET_TEXT" } },
      }),
    );
    await launch;
    await fetch(`http://127.0.0.1:${port}/webhook/SECRET_PATH?token=SECRET_QUERY`, {
      headers: { Authorization: "Bearer SECRET_TOKEN" },
    });
    const dead = await startFor("http://127.0.0.1:1", lines);
    await fetch(`http://127.0.0.1:${dead.port}/webhook/SECRET_PATH?token=SECRET_QUERY`, {
      headers: { Cookie: "session=SECRET_COOKIE" },
    });
    await fetchRaw(dead.port, upgradeRequest("/ws?wsToken=SECRET_TICKET"));
    expect(lines).toContain("Alice orchestration.dispatchCommand message.dispatch");
    expect(lines).toContain("Alice orchestration.launchThread");
    expect(lines).toContain("Alice upstream unreachable: ECONNREFUSED");
    expect(lines.join("\n")).not.toContain("SECRET");
  });
});
