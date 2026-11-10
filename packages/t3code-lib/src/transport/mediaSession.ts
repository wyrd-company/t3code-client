// ---
// relationships:
//   implements: library-wire
// ---
/**
 * The session side of one media socket: received items in arrival order for one async
 * iterator, the close details, and sends that require an open socket. The preview viewer and
 * live transcription extend it.
 */
import { T3ConnectionError } from "../errors.ts";
import {
  closeWebSocket,
  type WebSocketCloseInfo,
  type WebSocketLike,
} from "../internal/websocket.ts";
import type { StreamItem } from "../rpc/client.ts";
import type { MediaSocketSession } from "./mediaSocket.ts";

const SOCKET_OPEN = 1;

export abstract class MediaSession<T, C>
  implements MediaSocketSession, AsyncIterable<StreamItem<T>>
{
  protected readonly socket: () => WebSocketLike;
  readonly #label: string;
  readonly #closeReason: string;
  readonly #items: StreamItem<T>[] = [];
  #waiting: (() => void)[] = [];
  #ended = false;
  #resolveClosed!: (close: C) => void;
  /** Resolves when the socket ends, for any reason. */
  readonly closed = new Promise<C>((resolve) => {
    this.#resolveClosed = resolve;
  });

  /** `label` names the socket in errors; `closeReason` is the reason that `close` sends. */
  constructor(socket: () => WebSocketLike, label: string, closeReason: string) {
    this.socket = socket;
    this.#label = label;
    this.#closeReason = closeReason;
  }

  abstract receive(data: unknown): void;

  /** The value of `closed` for the close event `info`. */
  protected abstract closeDetails(info: WebSocketCloseInfo): C;

  end(info: WebSocketCloseInfo): void {
    this.#ended = true;
    this.#resolveClosed(this.closeDetails(info));
    this.#wakeAll();
  }

  /** Close the socket and end the iteration. A closed session stays closed. */
  async close(): Promise<void> {
    await closeWebSocket(this.socket(), this.#closeReason);
  }

  [Symbol.asyncIterator](): AsyncIterator<StreamItem<T>> {
    return {
      next: () => this.#next(),
      return: async () => {
        await this.close();
        return { done: true, value: undefined };
      },
    };
  }

  /** Runs before each attempt to take an item, also after a wait. */
  protected beforeTake(): void {}

  /** Runs for each item that the iterator gives out. */
  protected afterTake(_item: StreamItem<T>): void {}

  protected push(item: StreamItem<T>): void {
    this.#items.push(item);
    this.#wakeAll();
  }

  /** Raises `T3ConnectionError` when the socket is not open. */
  protected sendOpen(data: string | Uint8Array): void {
    const socket = this.socket();
    if (socket.readyState !== SOCKET_OPEN) {
      throw new T3ConnectionError("closed", `The ${this.#label} socket is closed.`);
    }
    socket.send(data);
  }

  protected isOpen(): boolean {
    return this.socket().readyState === SOCKET_OPEN;
  }

  async #next(): Promise<IteratorResult<StreamItem<T>>> {
    for (;;) {
      this.beforeTake();
      const item = this.#items.shift();
      if (item !== undefined) {
        this.afterTake(item);
        return { done: false, value: item };
      }
      if (this.#ended) return { done: true, value: undefined };
      await new Promise<void>((resolve) => {
        this.#waiting.push(resolve);
      });
    }
  }

  #wakeAll(): void {
    const waiting = this.#waiting;
    this.#waiting = [];
    for (const wake of waiting) wake();
  }
}
