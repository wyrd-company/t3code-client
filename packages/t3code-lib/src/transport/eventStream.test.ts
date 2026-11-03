// ---
// relationships:
//   verifies: library-transport
// ---
import { describe, expect, it, vi } from "vite-plus/test";

import { serverSentEventData } from "./eventStream.ts";

const bodyOf = (chunks: readonly string[], onCancel?: () => void) => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (onCancel === undefined) controller.close();
    },
    ...(onCancel === undefined ? {} : { cancel: onCancel }),
  });
};

const collect = async (chunks: readonly string[]) => {
  const seen: string[] = [];
  for await (const data of serverSentEventData(bodyOf(chunks))) seen.push(data);
  return seen;
};

describe("serverSentEventData", () => {
  it("yields each event, and skips comments and other fields", async () => {
    expect(
      await collect([": ping\n\n", "event: sample\nid: 1\ndata: one\n\n", "data:two\n\n"]),
    ).toEqual(["one", "two"]);
  });

  it("reads an event over chunk breaks, with each line break form", async () => {
    expect(
      await collect(["da", "ta: one\r", "\n\r", "\ndata: two\r\r", "data: three\n", "\n"]),
    ).toEqual(["one", "two", "three"]);
  });

  it("joins the data lines of one event, and keeps a character split over chunks", async () => {
    const euro = new TextEncoder().encode("data: €\n\n");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(euro.slice(0, 7));
        controller.enqueue(euro.slice(7));
        controller.close();
      },
    });
    const seen: string[] = [];
    for await (const data of serverSentEventData(body)) seen.push(data);
    expect(seen).toEqual(["€"]);
    expect(await collect(["data: one\ndata: two\n\n"])).toEqual(["one\ntwo"]);
  });

  it("drops an event that the body ends before", async () => {
    expect(await collect(["data: one\n\ndata: two\n"])).toEqual(["one"]);
  });

  it("cancels the body when the iteration ends", async () => {
    const cancel = vi.fn();
    for await (const data of serverSentEventData(bodyOf(["data: one\n\n"], cancel))) {
      expect(data).toBe("one");
      break;
    }
    expect(cancel).toHaveBeenCalledOnce();
  });
});
