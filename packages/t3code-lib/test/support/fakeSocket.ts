// ---
// relationships:
//   verifies: library-wire
// ---
/** A WebSocket that a unit test drives: it opens, receives and drops on request. */
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";

type Listener = (event: never) => void;

/** A socket that the test drives. */
export class FakeSocket {
  static last: FakeSocket;
  readyState = 0;
  readonly url: string;
  readonly sent: (string | Uint8Array)[] = [];
  binaryType = "blob";
  readonly #listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
  }
  addEventListener(type: string, listener: Listener): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }
  send(data: string | Uint8Array): void {
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

/** The constructor to pass as `webSocket`. */
export const fakeWebSocket = FakeSocket as unknown as WebSocketConstructor;
