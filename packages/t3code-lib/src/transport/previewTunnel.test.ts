import { describe, expect, it, vi } from "vite-plus/test";
import { FakeSocket, fakeWebSocket } from "../../test/support/fakeSocket.ts";
import { T3Client } from "../client.ts";
import { T3ConnectionError, T3PreconditionError } from "../errors.ts";
import { PreviewTunnelPort, connectPreviewTunnel } from "./previewTunnel.ts";

describe("preview tunnel", () => {
  it.each([0, -1, 65536, 1.5, NaN])("refuses port %s before asking for a ticket", async (port) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = T3Client.create({ baseUrl: "https://sample.invalid", fetch });
    try {
      await expect(client.openPreviewTunnel(port)).rejects.toBeInstanceOf(T3PreconditionError);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  });

  it("accepts the first and last TCP ports", () => {
    expect(PreviewTunnelPort.parse(1)).toBe(1);
    expect(PreviewTunnelPort.parse(65535)).toBe(65535);
  });

  it("yields binary data in order and reports unexpected text", async () => {
    const pending = connectPreviewTunnel(
      fakeWebSocket,
      new URL("wss://sample.invalid/api/preview/tunnel?port=8000"),
    );
    const socket = FakeSocket.last;
    socket.open();
    const tunnel = await pending;
    try {
      const input = new Uint8Array([0, 255]);
      tunnel.send(input);
      expect(socket.sent).toEqual([input]);
      socket.message(input.buffer);
      socket.message("sample text");
      socket.message(Buffer.from([1]));
      const received = tunnel[Symbol.asyncIterator]();
      expect((await received.next()).value).toEqual({ kind: "item", value: input });
      expect((await received.next()).value).toMatchObject({
        kind: "decode-error",
        error: { code: "decode" },
      });
      expect((await received.next()).value).toEqual({ kind: "item", value: new Uint8Array([1]) });
      socket.drop(1000, "closed");
      await expect(received.next()).resolves.toMatchObject({ done: true });
      expect(() => tunnel.send(input)).toThrow(T3ConnectionError);
    } finally {
      await tunnel.close();
    }
  });
});
