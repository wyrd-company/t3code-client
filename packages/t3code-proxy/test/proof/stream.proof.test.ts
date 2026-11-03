// ---
// relationships:
//   verifies: proxy
// ---
/** A client that stops reading on a person's hostname still gets a large turn, complete and in order. */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import type { ThreadId } from "@wyrd-company/t3code-lib";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { WebSocket } from "ws";
import { connect, routes, until, urls } from "./proofSupport.ts";

/** Counts what it reads, so that the test can stop and start its reading. */
class SlowWebSocket extends WebSocket {
  static all: SlowWebSocket[] = [];
  received = 0;

  constructor(...args: ConstructorParameters<typeof WebSocket>) {
    super(...args);
    SlowWebSocket.all.push(this);
    this.on("message", (data: Buffer) => (this.received += data.length));
  }
}

/** Every event of a thread, as it arrives. */
const follow = (client: ReturnType<typeof connect>, threadId: ThreadId, stop: AbortSignal) => {
  const watch = {
    events: [] as { sequence: number; body: string }[],
    synchronized: false,
    reconnected: false,
  };
  void (async () => {
    for await (const item of client.threads.watch(threadId, { signal: stop })) {
      if (item.kind === "synchronized") watch.synchronized = true;
      if (item.kind === "reconnected") watch.reconnected = true;
      if (item.kind === "event") {
        watch.events.push({ sequence: item.sequence, body: JSON.stringify(item.event) });
      }
    }
  })().catch(() => undefined);
  return watch;
};

/** Subscriptions on the slow socket, so that one turn is about 2 MB on one connection. */
const SUBSCRIPTIONS = 25;

describe("a large streamed turn", () => {
  const proof = routes();
  afterAll(proof.close);

  it("reaches a client that stopped reading, complete and in order", async () => {
    const stop = new AbortController();
    // A client that does not read misses pongs, so that its usual heartbeat would reconnect it.
    const slow = connect(urls.alice, { webSocket: SlowWebSocket, pingIntervalMs: 600_000 });
    const threadId = await proof.launch(proof.direct);
    const reference = follow(proof.direct, threadId, stop.signal);
    const slowed = Array.from({ length: SUBSCRIPTIONS }, () => follow(slow, threadId, stop.signal));
    await until(
      async () => (slowed.every((watch) => watch.synchronized) ? true : undefined),
      "the subscriptions",
      30_000,
    );
    expect(SlowWebSocket.all.length).toBe(1);
    const socket = SlowWebSocket.all[0]!;
    const before = slowed.map((watch) => watch.events.length);

    socket.pause();
    await proof.alice.threads.startTurn({
      threadId,
      text: "Reply with the whole numbers from 1 to 3000, one on each line, in order, and nothing else. Use no tools.",
    });
    await proof.settled(threadId);
    const last = await until(async () => reference.events.at(-1), "the events", 30_000);
    // Nothing that the turn produced reached the slow client while it did not read.
    expect(slowed.map((watch) => watch.events.length)).toEqual(before);
    socket.resume();

    await Promise.all(
      slowed.map((watch) =>
        expect.poll(() => watch.events.at(-1)?.sequence, { timeout: 120_000 }).toBe(last.sequence),
      ),
    );
    const received = socket.received;
    stop.abort();
    await slow.close();

    const evidence = process.env["T3_PROXY_PROOF_EVIDENCE_DIR"];
    if (evidence) {
      NodeFS.writeFileSync(
        NodePath.join(evidence, "stream.json"),
        JSON.stringify({ events: reference.events.length, received }),
      );
    }
    const expected = reference.events.map((event) => [event.sequence, event.body]);
    expect(expected.length).toBeGreaterThan(20);
    expect(received).toBeGreaterThan(1_000_000);
    for (const watch of slowed) {
      expect(watch.reconnected).toBe(false);
      expect(watch.events.map((event) => [event.sequence, event.body])).toEqual(expected);
    }
  });
});
