// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, it } from "vite-plus/test";
import { FakeSocket, fakeWebSocket as webSocket } from "../../test/support/fakeSocket.ts";
import { memoryCredentialStore } from "../auth/credentialStore.ts";
import { T3Client } from "../client.ts";
import { T3AuthError, T3ConnectionError, T3PreconditionError } from "../errors.ts";
import { DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS } from "../http/speechAudio.ts";
import type { AuthGrantedScope } from "../schemas/auth.ts";
import { SPEECH_STREAM_MAX_CHUNK_BYTES } from "../schemas/speechStream.ts";
import { connectSpeechStream, speechStreamStart } from "./speechStream.ts";

const url = new URL("ws://127.0.0.1:1/ws/voice?wsTicket=sample-ticket");
const start = speechStreamStart(DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS);

async function opened() {
  const pending = connectSpeechStream(webSocket, url, start);
  FakeSocket.last.open();
  return { stream: await pending, socket: FakeSocket.last };
}

describe("SpeechStream", () => {
  it("sends start with the options as soon as the socket opens", async () => {
    const { socket } = await opened();
    expect(socket.binaryType).toBe("arraybuffer");
    expect(socket.sent).toEqual([
      JSON.stringify({ type: "start", options: DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS }),
    ]);
  });

  it("sends audio as binary messages and finish as text", async () => {
    const { stream, socket } = await opened();
    const pcm = new Uint8Array(8);
    stream.sendAudio(pcm);
    stream.finish();
    expect(socket.sent.slice(1)).toEqual([pcm, JSON.stringify({ type: "finish" })]);
  });

  it("refuses audio that is empty, not whole samples or over one message", async () => {
    const { stream, socket } = await opened();
    for (const size of [0, 3, SPEECH_STREAM_MAX_CHUNK_BYTES + 4]) {
      expect(() => stream.sendAudio(new Uint8Array(size)), String(size)).toThrow(
        T3PreconditionError,
      );
    }
    stream.sendAudio(new Uint8Array(SPEECH_STREAM_MAX_CHUNK_BYTES));
    expect(socket.sent).toHaveLength(2);
  });

  it("yields events in order and a decode error for anything else", async () => {
    const { stream, socket } = await opened();
    socket.message(JSON.stringify({ type: "ready" }));
    const text = { committed: "sample", tentative: " text" };
    socket.message(JSON.stringify({ type: "update", revision: 1, text }));
    socket.message(JSON.stringify({ type: "update", revision: 2, text: null }));
    socket.message(JSON.stringify({ type: "update", revision: "1", text: null }));
    socket.message("not json");
    socket.message(new Uint8Array([1]).buffer);
    socket.message(JSON.stringify({ type: "finished", text: "sample text" }));
    socket.drop(1000, "");
    const items = [];
    for await (const item of stream) items.push(item);
    expect(items.map((item) => (item.kind === "item" ? item.value : item.kind))).toEqual([
      { type: "ready" },
      { type: "update", revision: 1, text },
      { type: "update", revision: 2, text: null },
      "decode-error",
      "decode-error",
      "decode-error",
      { type: "finished", text: "sample text" },
    ]);
    expect(await stream.closed).toEqual({ code: 1000, reason: "" });
  });

  it("refuses to send after the socket ends, and a break closes it", async () => {
    const { stream, socket } = await opened();
    socket.message(JSON.stringify({ type: "error", message: "sample failure" }));
    socket.drop(1008, "Speech stream ended");
    expect(() => stream.finish()).toThrow(T3ConnectionError);
    expect(await stream.closed).toEqual({ code: 1008, reason: "Speech stream ended" });

    const second = await opened();
    second.socket.message(JSON.stringify({ type: "ready" }));
    for await (const _ of second.stream) break;
    expect(second.socket.readyState).toBe(3);
  });

  it("rejects without the address when the socket does not open", async () => {
    const pending = connectSpeechStream(webSocket, url, start);
    FakeSocket.last.drop(1006, "");
    const error = await pending.catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(T3ConnectionError);
    expect(String(error)).not.toContain("sample-ticket");
  });

  it("refuses invalid or oversized options before it opens", () => {
    expect(() => speechStreamStart({ speechLanguage: "x" } as never)).toThrow(T3PreconditionError);
    // The options object keeps unknown keys, so only the size check refuses this one.
    const oversized = { ...DEFAULT_SPEECH_TRANSCRIPTION_OPTIONS, sample: "x".repeat(128_000) };
    expect(() => speechStreamStart(oversized)).toThrow("too large");
  });
});

describe("T3Client.openSpeechStream", () => {
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

  it("opens /ws/voice with a media ticket", async () => {
    const { t3, requests } = client(["orchestration:operate"]);
    const pending = t3.openSpeechStream();
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    await expect.poll(() => new URL(FakeSocket.last.url).pathname).toBe("/ws/voice");
    const address = new URL(FakeSocket.last.url);
    expect(requests[0]?.url).toContain("/api/auth/websocket-ticket/media");
    expect(address.protocol).toBe("wss:");
    expect(address.pathname).toBe("/ws/voice");
    expect(Object.fromEntries(address.searchParams)).toEqual({ wsTicket: "sample-ticket" });
    FakeSocket.last.open();
    await (await pending).close();
  });

  it("refuses a session without orchestration:operate before it asks for a ticket", async () => {
    const { t3, requests } = client(["orchestration:read"]);
    await expect(t3.openSpeechStream()).rejects.toBeInstanceOf(T3AuthError);
    expect(requests).toEqual([]);
  });
});
