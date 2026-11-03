// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, it } from "vite-plus/test";
import { memoryCredentialStore } from "../auth/credentialStore.ts";
import { T3Client } from "../client.ts";
import { T3AuthError, T3ConnectionError, T3PreconditionError } from "../errors.ts";
import type { WebSocketConstructor } from "../internal/websocket.ts";
import type { AuthGrantedScope } from "../schemas/auth.ts";
import { threadId } from "../schemas/common.ts";
import { connectPreviewViewer } from "./previewViewer.ts";

type Listener = (event: never) => void;

/** A socket that the test drives. */
class FakeSocket {
  static last: FakeSocket;
  readyState = 0;
  readonly url: string;
  readonly sent: string[] = [];
  binaryType = "blob";
  readonly #listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
  }
  addEventListener(type: string, listener: Listener): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(code = 1000, reason = ""): void {
    this.drop(code, reason);
  }
  open(): void {
    this.readyState = 1;
    this.#emit("open", {});
  }
  message(data: unknown): void {
    this.#emit("message", { data });
  }
  drop(code: number, reason: string): void {
    this.readyState = 3;
    this.#emit("close", { code, reason });
  }
  #emit(type: string, event: unknown): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(event as never);
  }
}

const webSocket = FakeSocket as unknown as WebSocketConstructor;
const url = new URL("ws://127.0.0.1:1/api/preview-stream/ws?wsTicket=sample-ticket");

async function opened() {
  const pending = connectPreviewViewer(webSocket, url);
  FakeSocket.last.open();
  return { viewer: await pending, socket: FakeSocket.last };
}

describe("PreviewViewer", () => {
  it("asks for array buffers and yields frames and messages in order", async () => {
    const { viewer, socket } = await opened();
    expect(socket.binaryType).toBe("arraybuffer");
    socket.message(new Uint8Array([1, 2]).buffer);
    socket.message(Buffer.from([3]));
    socket.message(JSON.stringify({ type: "clipboard", text: "sample" }));
    const iterator = viewer[Symbol.asyncIterator]();
    expect(await iterator.next()).toMatchObject({
      value: { kind: "item", value: { type: "frame", bytes: new Uint8Array([1, 2]) } },
    });
    expect(await iterator.next()).toMatchObject({
      value: { kind: "item", value: { type: "frame", bytes: new Uint8Array([3]) } },
    });
    expect(await iterator.next()).toMatchObject({
      value: { kind: "item", value: { type: "clipboard", text: "sample" } },
    });
  });

  it("acknowledges a frame only when the consumer asks for more", async () => {
    const { viewer, socket } = await opened();
    socket.message(new Uint8Array([1]).buffer);
    socket.message(JSON.stringify({ type: "clipboard", text: "sample" }));
    const iterator = viewer[Symbol.asyncIterator]();
    await iterator.next();
    expect(socket.sent).toEqual([]);
    await iterator.next();
    expect(socket.sent).toEqual([JSON.stringify({ type: "ack" })]);
    socket.message(JSON.stringify({ type: "clipboard", text: "sample" }));
    await iterator.next();
    expect(socket.sent).toHaveLength(1);
  });

  it("yields a decode error for text that is not a message", async () => {
    const { viewer, socket } = await opened();
    socket.message("not json");
    socket.message(JSON.stringify({ type: "probe" }));
    const iterator = viewer[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toMatchObject({ kind: "decode-error" });
    expect((await iterator.next()).value).toMatchObject({ kind: "decode-error" });
  });

  it("validates an input, and refuses it after the socket ends", async () => {
    const { viewer, socket } = await opened();
    viewer.send({ type: "takeControl" });
    expect(socket.sent).toEqual([JSON.stringify({ type: "takeControl" })]);
    expect(() => viewer.send({ type: "ack" } as never)).toThrow(T3PreconditionError);
    socket.drop(1006, "");
    expect(() => viewer.send({ type: "takeControl" })).toThrow(T3ConnectionError);
  });

  it("names each kind of close", async () => {
    const closeWith = async (code: number, reason: string) => {
      const { viewer, socket } = await opened();
      socket.drop(code, reason);
      return viewer.closed;
    };
    expect(await closeWith(4404, "tab closed")).toMatchObject({ tabGone: true, reconnect: false });
    expect(await closeWith(1012, "reconnect")).toMatchObject({ tabGone: false, reconnect: true });
    expect(
      await closeWith(4503, JSON.stringify({ need: "libraries", command: "sample setup" })),
    ).toMatchObject({ hostSetup: { need: "libraries", command: "sample setup" } });
    expect(await closeWith(4503, "not json")).not.toHaveProperty("hostSetup");
  });

  it("ends the iteration on close, and a break closes the socket", async () => {
    const { viewer, socket } = await opened();
    const iterator = viewer[Symbol.asyncIterator]();
    const waiting = iterator.next();
    socket.drop(1000, "");
    expect(await waiting).toMatchObject({ done: true });

    const second = await opened();
    second.socket.message(JSON.stringify({ type: "clipboard", text: "sample" }));
    for await (const _ of second.viewer) break;
    expect(second.socket.readyState).toBe(3);
  });

  it("answers every waiting call of the iterator", async () => {
    const { viewer, socket } = await opened();
    const iterator = viewer[Symbol.asyncIterator]();
    const first = iterator.next();
    const second = iterator.next();
    const third = iterator.next();
    socket.message(JSON.stringify({ type: "clipboard", text: "first" }));
    socket.message(JSON.stringify({ type: "clipboard", text: "second" }));
    expect((await first).value).toMatchObject({ value: { text: "first" } });
    expect((await second).value).toMatchObject({ value: { text: "second" } });
    socket.drop(1000, "");
    expect(await third).toMatchObject({ done: true });
  });

  it("acknowledges a frame for a call that already waits", async () => {
    const { viewer, socket } = await opened();
    const iterator = viewer[Symbol.asyncIterator]();
    const first = iterator.next();
    const second = iterator.next();
    socket.message(new Uint8Array([1]).buffer);
    await first;
    await expect.poll(() => socket.sent).toEqual([JSON.stringify({ type: "ack" })]);
    socket.message(JSON.stringify({ type: "clipboard", text: "sample" }));
    expect((await second).value).toMatchObject({ value: { text: "sample" } });
  });

  it("rejects without the address when the socket does not open", async () => {
    const pending = connectPreviewViewer(webSocket, url);
    FakeSocket.last.drop(1006, "");
    const error = await pending.catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(T3ConnectionError);
    expect(String(error)).not.toContain("sample-ticket");
  });

  it("stops opening when the signal aborts", async () => {
    const controller = new AbortController();
    const pending = connectPreviewViewer(webSocket, url, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "interrupted" });
    await expect(connectPreviewViewer(webSocket, url, controller.signal)).rejects.toMatchObject({
      code: "interrupted",
    });
  });
});

describe("T3Client.openPreviewViewer", () => {
  const target = { threadId: threadId("thread-1"), tabId: "tab-1", maxWidth: 800 };
  const client = (scopes?: AuthGrantedScope[]) => {
    const requests: Request[] = [];
    const fetchStub: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({ ticket: "sample-ticket", expiresAt: "2030-01-01T00:00:00.000Z" });
    };
    const t3 = T3Client.create({
      baseUrl: "https://sample.invalid",
      credentials: memoryCredentialStore({
        accessToken: "sample-token",
        ...(scopes === undefined ? {} : { scopes }),
      }),
      fetch: fetchStub,
      webSocket,
    });
    return { t3, requests };
  };

  it("uses a media ticket and the target in the address of the socket", async () => {
    const { t3, requests } = client();
    const pending = t3.openPreviewViewer(target);
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    await expect.poll(() => FakeSocket.last.url).toContain("sample-ticket");
    const address = new URL(FakeSocket.last.url);
    expect(requests[0]?.url).toContain("/api/auth/websocket-ticket/media");
    expect(address.protocol).toBe("wss:");
    expect(address.pathname).toBe("/api/preview-stream/ws");
    expect(Object.fromEntries(address.searchParams)).toEqual({
      threadId: "thread-1",
      tabId: "tab-1",
      maxWidth: "800",
      wsTicket: "sample-ticket",
    });
    FakeSocket.last.open();
    await (await pending).close();
  });

  it("refuses a target outside the schema, and a session without the scope", async () => {
    const { t3 } = client();
    await expect(t3.openPreviewViewer({ ...target, quality: 0 })).rejects.toBeInstanceOf(
      T3PreconditionError,
    );
    const scoped = client(["terminal:read"]).t3;
    await expect(scoped.openPreviewViewer(target)).rejects.toBeInstanceOf(T3AuthError);
  });
});
