// ---
// relationships:
//   verifies: proxy
// ---
import * as NodeNet from "node:net";
import { describe, expect, it } from "vite-plus/test";
import { WebSocket } from "ws";
import { ATTACHMENT_ONLY_PLACEHOLDER } from "./byline.ts";
import {
  cleanups,
  closed,
  connectPair,
  dispatchFrame,
  fetchRaw,
  nextConnection,
  nextMessage,
  open,
  requestEnded,
  signal,
  startFor,
  startUpstream,
  upgradeRequest,
} from "../test/support/proxySupport.ts";

describe("the /ws bridge", () => {
  it("adds the byline of the listener", async () => {
    const upstream = await startUpstream();
    const service = await startFor(upstream.url);
    for (const [index, name] of ["Alice", "Sam"].entries()) {
      const { client, server } = await connectPair(upstream, service.listeners[index]!.port);
      const received = nextMessage(server);
      client.send(dispatchFrame("hi"));
      const frame = JSON.parse((await received).data.toString()) as { payload: { text: string } };
      expect(frame.payload.text).toBe(`hi\n\n— Sent by ${name}`);
    }
  });
  it("uses every configured name in a queue edit", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    const received = nextMessage(server);
    client.send(
      JSON.stringify({
        _tag: "Request",
        tag: "orchestration.dispatchCommand",
        payload: { type: "queued-run.edit", text: "hi\n\n— Sent by Sam" },
      }),
    );
    const frame = JSON.parse((await received).data.toString()) as { payload: { text: string } };
    expect(frame.payload.text).toBe("hi\n\n— Sent by Alice");
  });
  it("replaces the placeholder of a real frame", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    const received = nextMessage(server);
    client.send(dispatchFrame(ATTACHMENT_ONLY_PLACEHOLDER, { attachments: [{ id: "a" }] }));
    const frame = JSON.parse((await received).data.toString()) as {
      payload: { text: string; attachments: unknown[] };
    };
    expect(frame.payload).toMatchObject({ text: "— Sent by Alice", attachments: [{ id: "a" }] });
  });
  it.each([
    ["text that is not JSON", " not json ", false],
    ["a frame with no change", ' {"_tag" : "Ping"} ', false],
    ["a slash command", dispatchFrame("/compact").replace("{", "{ "), false],
    ["a binary frame", dispatchFrame("hi"), true],
  ])("passes %s byte for byte", async (_name, frame, binary) => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    const received = nextMessage(server);
    client.send(Buffer.from(frame), { binary });
    const message = await received;
    expect(message.isBinary).toBe(binary);
    expect(message.data.toString()).toBe(frame);
  });
  it("passes server frames with no change", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    for (const [frame, binary] of [
      [dispatchFrame("hi"), false],
      [dispatchFrame("hi"), true],
    ] as const) {
      const received = nextMessage(client);
      server.send(Buffer.from(frame), { binary });
      const message = await received;
      expect(message.isBinary).toBe(binary);
      expect(message.data.toString()).toBe(frame);
    }
  });
  it("keeps the Host, query, cookies and forwarded headers of the upgrade", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const accepted = nextConnection(upstream);
    await open(port, "/ws?wsToken=sample", undefined, {
      Host: "app.example.test",
      Origin: "https://app.example.test",
      Cookie: "session=sample",
      "X-Forwarded-Proto": "https",
    });
    await accepted;
    const request = upstream.upgrades.at(-1)!;
    expect(request.url).toBe("/ws?wsToken=sample");
    expect(request.headers).toMatchObject({
      host: "app.example.test",
      origin: "https://app.example.test",
      cookie: "session=sample",
      "x-forwarded-proto": "https",
    });
  });
  it("uses the subprotocol that the server selects", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const client = await open(port, "/ws", ["first", "second"]);
    expect(client.protocol).toBe("second");
  });
  it("does not complete the client upgrade before the server accepts", async () => {
    let accept!: (value: boolean) => void;
    const reached = signal();
    const upstream = await startUpstream(undefined, {
      verifyClient: (done) => {
        accept = done;
        reached.resolve();
      },
    });
    const { port } = await startFor(upstream.url);
    let opened = false;
    const pending = open(port).then((socket) => {
      opened = true;
      return socket;
    });
    await reached.promise;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(opened).toBe(false);
    accept(true);
    await pending;
  });
  it("returns the status and body when the server refuses", async () => {
    const body = "Unsupported orchestration protocol";
    const upstream = await startUpstream();
    upstream.server.removeAllListeners("upgrade");
    upstream.server.on("upgrade", (_request, socket) => {
      socket.end(
        `HTTP/1.1 426 Upgrade Required\r\nContent-Type: text/plain\r\nContent-Length: ${body.length}\r\nX-Sample: 1\r\n\r\n${body}`,
      );
    });
    const { port } = await startFor(upstream.url);
    const answer = await fetchRaw(port, upgradeRequest("/ws"));
    expect(answer.split("\r\n")[0]).toBe("HTTP/1.1 426 Upgrade Required");
    expect(answer).toContain("Content-Type: text/plain");
    expect(answer).toContain("X-Sample: 1");
    expect(answer.endsWith(`\r\n\r\n${body}`)).toBe(true);
  });
  it("returns a chunked refusal body with plain framing", async () => {
    const upstream = await startUpstream();
    upstream.server.removeAllListeners("upgrade");
    upstream.server.on("upgrade", (_request, socket) => {
      socket.end(
        "HTTP/1.1 403 Forbidden\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n",
      );
    });
    const { port } = await startFor(upstream.url);
    const answer = await fetchRaw(port, upgradeRequest("/ws"));
    expect(answer.split("\r\n")[0]).toBe("HTTP/1.1 403 Forbidden");
    expect(answer.toLowerCase()).not.toContain("transfer-encoding");
    expect(answer.endsWith("\r\n\r\nhello world")).toBe(true);
  });
  it("closes the upgrade when the server cannot be reached", async () => {
    const lines: string[] = [];
    const { port } = await startFor("http://127.0.0.1:1", lines);
    expect(await fetchRaw(port, upgradeRequest("/ws"))).toBe("");
    expect(lines).toContain("Alice upstream unreachable: ECONNREFUSED");
  });
  it("ends the server connection when the client leaves during the upgrade", async () => {
    let accept!: (value: boolean) => void;
    const reached = signal();
    const upstream = await startUpstream(undefined, {
      verifyClient: (done) => {
        accept = done;
        reached.resolve();
      },
    });
    const { port } = await startFor(upstream.url);
    const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    client.on("error", () => undefined);
    await reached.promise;
    const aborted = requestEnded(upstream);
    client.terminate();
    await aborted;
    accept(true);
  });
  it("ends the server connection when the client half-closes during the upgrade", async () => {
    const reached = signal();
    const upstream = await startUpstream(undefined, { verifyClient: () => reached.resolve() });
    const { port } = await startFor(upstream.url);
    const client = NodeNet.connect(port, "127.0.0.1", () => client.write(upgradeRequest("/ws")));
    client.on("error", () => undefined);
    cleanups.push(() => void client.destroy());
    await reached.promise;
    const aborted = requestEnded(upstream);
    client.end();
    await aborted;
  });
  it("closes an upgrade to another protocol on /ws", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const answer = await fetchRaw(
      port,
      "GET /ws HTTP/1.1\r\nHost: a\r\nConnection: Upgrade\r\nUpgrade: other\r\n\r\n",
    );
    expect(answer).toBe("");
    expect(upstream.upgrades).toEqual([]);
  });
  it("bridges a client that offers compression to a server that supports it", async () => {
    const upstream = await startUpstream(undefined, { perMessageDeflate: true });
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    expect(client.extensions).toBe("");
    expect(upstream.upgrades.at(-1)?.headers["sec-websocket-extensions"]).toBeUndefined();
    const received = nextMessage(server);
    client.send("sample");
    expect((await received).data.toString()).toBe("sample");
  });
  it("ends the server connection when the client handshake is invalid", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const accepted = nextConnection(upstream);
    const answer = fetchRaw(
      port,
      `GET /ws HTTP/1.1\r\nHost: a\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\n\r\n`,
    );
    const server = await accepted;
    await closed(server);
    expect(await answer).toContain("400");
  });
  it.each([
    [4001, "client reason"],
    [1000, ""],
    [1001, "going"],
  ])("passes the close code %i and reason from the client", async (code, reason) => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    const end = closed(server);
    client.close(code, reason);
    expect(await end).toEqual({ code, reason });
  });
  it("passes the close code and reason from the server", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    const end = closed(client);
    server.close(4002, "server reason");
    expect(await end).toEqual({ code: 4002, reason: "server reason" });
  });
  it("closes the other side with no code when no code was received", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    const end = closed(server);
    client.close();
    expect((await end).code).toBe(1005);
  });
  it("closes the client when the server connection fails", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    const end = closed(client);
    server.terminate();
    expect((await end).code).toBe(1005);
  });
  it("closes the server connection when the client fails", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    const end = closed(server);
    client.terminate();
    await end;
  });
  it("sets no frame size limit, so that the server's limit applies", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    const size = 101 * 1024 * 1024;
    const toServer = nextMessage(server);
    client.send(Buffer.alloc(size, 1), { binary: true });
    expect((await toServer).data.length).toBe(size);
    const toClient = nextMessage(client);
    server.send(Buffer.alloc(size, 2), { binary: true });
    expect((await toClient).data.length).toBe(size);
  });
  it("passes pings and pongs end to end", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    const pong = new Promise<Buffer>((resolve) => client.once("pong", resolve));
    const ping = new Promise<Buffer>((resolve) => server.once("ping", resolve));
    client.ping("sample");
    expect((await ping).toString()).toBe("sample");
    expect((await pong).toString()).toBe("sample");
  });
  it("leaves the pong to the far end", async () => {
    const upstream = await startUpstream(undefined, { autoPong: false });
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    let pongs = 0;
    client.on("pong", () => (pongs += 1));
    const ping = new Promise<Buffer>((resolve) => server.once("ping", resolve));
    client.ping("sample");
    await ping;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pongs).toBe(0);
  });
  it("stops reading the server while the client is slow, and keeps all frames in order", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    client.pause();
    const count = 128;
    const frame = Buffer.alloc(1024 * 1024);
    let flushed = 0;
    for (let index = 0; index < count; index += 1) {
      frame.writeUInt32BE(index);
      server.send(Buffer.from(frame), { binary: true }, () => (flushed += 1));
    }
    let last = -1;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (flushed === last) break;
      last = flushed;
    }
    expect(flushed).toBeLessThan(count);

    const order: number[] = [];
    const finished = new Promise<void>((resolve) => {
      client.on("message", (data: Buffer) => {
        order.push(data.readUInt32BE());
        if (order.length === count) resolve();
      });
    });
    client.resume();
    await finished;
    expect(order).toEqual(Array.from({ length: count }, (_value, index) => index));
    expect(flushed).toBe(count);
  });
  it("completes a close while the bridge has paused the other side", async () => {
    const upstream = await startUpstream();
    const { port } = await startFor(upstream.url);
    const { client, server } = await connectPair(upstream, port);
    client.pause();
    const frame = Buffer.alloc(1024 * 1024);
    for (let index = 0; index < 128; index += 1) server.send(frame, { binary: true });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const end = closed(server);
    const started = Date.now();
    client.terminate();
    await end;
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
