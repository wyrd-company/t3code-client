// ---
// relationships:
//   verifies: library-transport
// ---
import * as NodeUtil from "node:util";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  T3ConnectionError,
  T3InterruptedError,
  T3NotFoundError,
  T3PreconditionError,
} from "../errors.ts";
import { GuestShareId } from "../schemas/common.ts";
import { HttpTransport } from "../transport/http.ts";
import { HttpRouteClient } from "./client.ts";
import { httpRoutes } from "./registry.ts";
import { webhookUrlParams } from "./routes/webhooks.ts";

const share = GuestShareId.parse("sample-share");

function streamSetup(answer: () => Response) {
  const requests: Request[] = [];
  const http = new HttpTransport({
    baseUrl: "https://host.invalid",
    fetch: vi.fn<typeof globalThis.fetch>(async (input, init) => {
      requests.push(new Request(input, init));
      return answer();
    }),
    getAccessToken: async () => "sample-token",
  });
  return { requests, routes: new HttpRouteClient(http, httpRoutes) };
}

const eventBody = (text: string) =>
  new Response(text, { headers: { "content-type": "text/event-stream" } });

describe("HttpRouteClient.stream", () => {
  it("decodes each event, sends no token, and keeps going after one that does not decode", async () => {
    const { requests, routes } = streamSetup(() =>
      eventBody(
        ': ping\n\ndata: {"type":"ended"}\n\ndata: not json\n\ndata: {"type":"sample"}\n\n',
      ),
    );
    const seen = [];
    for await (const event of routes.stream("guest.stream", { query: { share } })) seen.push(event);
    expect(seen[0]).toEqual({ kind: "item", value: { type: "ended" } });
    expect(seen[1]).toMatchObject({ kind: "decode-error", error: { raw: "not json" } });
    expect(seen[2]).toMatchObject({ kind: "item", value: { unknown: true } });
    expect(new URL(requests[0]?.url ?? "").searchParams.get("share")).toBe(share);
    expect(requests[0]?.headers.get("accept")).toBe("text/event-stream");
    expect(requests[0]?.headers.get("authorization")).toBeNull();
  });

  it("raises the server's refusal, and refuses a bad input without sending it", async () => {
    const { requests, routes } = streamSetup(() =>
      Response.json({ reason: "inactive", message: "Sample." }, { status: 403 }),
    );
    await expect(routes.stream("guest.stream", { query: { share } }).next()).rejects.toMatchObject({
      code: "insufficient_scope",
      status: 403,
      reason: "inactive",
    });
    await expect(
      routes.stream("guest.stream", { query: {} } as never).next(),
    ).rejects.toBeInstanceOf(T3PreconditionError);
    expect(requests).toHaveLength(1);
  });

  it("raises an abort as an interruption, and a lost body as a closed connection", async () => {
    const abort = new AbortController();
    const held = new ReadableStream<Uint8Array>({
      start(controller) {
        abort.signal.addEventListener("abort", () => controller.error(new Error("sample abort")));
        controller.enqueue(new TextEncoder().encode('data: {"type":"ended"}\n\n'));
      },
    });
    const waiting = streamSetup(() => new Response(held)).routes.stream(
      "guest.stream",
      { query: { share } },
      abort.signal,
    );
    await waiting.next();
    const next = waiting.next();
    abort.abort();
    await expect(next).rejects.toBeInstanceOf(T3InterruptedError);

    const lost = new ReadableStream<Uint8Array>({
      start: (controller) => controller.error(new Error("sample loss")),
    });
    await expect(
      streamSetup(() => new Response(lost))
        .routes.stream("guest.stream", { query: { share } })
        .next(),
    ).rejects.toSatisfy((error) => error instanceof T3ConnectionError && error.reason === "closed");
  });

  it("delivers no more events after an abort, with more in the same chunk", async () => {
    const abort = new AbortController();
    const { routes } = streamSetup(() =>
      eventBody('data: {"type":"ended"}\n\ndata: {"type":"ended"}\n\n'),
    );
    const events = routes.stream("guest.stream", { query: { share } }, abort.signal);
    await events.next();
    abort.abort();
    await expect(events.next()).rejects.toBeInstanceOf(T3InterruptedError);
  });

  it("keeps event stream routes and the other routes apart", async () => {
    const { requests, routes } = streamSetup(() => eventBody(""));
    await expect(routes.call("guest.stream", { query: { share } })).rejects.toBeInstanceOf(
      T3PreconditionError,
    );
    // @ts-expect-error `guest.session` is not an event stream.
    const wrong = routes.stream("guest.session", { query: { share } });
    await expect(wrong.next()).rejects.toBeInstanceOf(T3PreconditionError);
    expect(requests).toHaveLength(0);
  });
});

describe("guest and webhook requests", () => {
  it("sends a guest's message as fields and `file` parts", async () => {
    const { requests, routes } = streamSetup(() => new Response(null, { status: 204 }));
    await routes.call("guest.submit", {
      query: { share },
      body: {
        shareId: share,
        text: "  Sample.  ",
        files: [{ name: "a.txt", mimeType: "text/plain", bytes: new Uint8Array([1]) }],
      },
    });
    const form = await (requests[0] as Request).formData();
    expect(form.get("shareId")).toBe(share);
    expect(form.get("text")).toBe("Sample.");
    expect((form.getAll("file") as File[]).map((file) => file.name)).toEqual(["a.txt"]);
  });

  it("refuses a guest name of more than one line, without sending it", async () => {
    const { requests, routes } = streamSetup(() => new Response(null, { status: 204 }));
    await expect(
      routes.call("guest.redeem", { body: { credential: "sample", name: "Two\nlines" } }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
    expect(requests).toHaveLength(0);
  });

  it("sends a webhook's bytes with the caller's headers, and hides the path's token", async () => {
    const { requests, routes } = streamSetup(() => Response.json({ deliveryId: "sample" }));
    const params = { hookId: "sample-hook", token: "sample-secret-token" };
    const body = new Uint8Array([123, 125]);
    await expect(
      routes.call("webhooks.webhookPatch", {
        params,
        query: { event: "sample" },
        headers: { "content-type": "application/json", "x-sample-signature": "sha256=00" },
        body,
      }),
    ).resolves.toEqual({ deliveryId: "sample" });
    const request = requests[0] as Request;
    expect(request.method).toBe("PATCH");
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(request.headers.get("x-sample-signature")).toBe("sha256=00");
    expect(request.headers.get("authorization")).toBeNull();
    expect(new Uint8Array(await request.arrayBuffer())).toEqual(body);

    const refusing = streamSetup(() => Response.json({ error: "hook_not_found" }, { status: 404 }));
    const error = await refusing.routes
      .call("webhooks.webhookGet", { params })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(T3NotFoundError);
    expect(error).toMatchObject({ reason: "hook_not_found" });
    expect(NodeUtil.inspect(error)).not.toContain(params.token);
  });

  it("refuses a header that is not valid, and does not quote its value", async () => {
    const { requests, routes } = streamSetup(() => Response.json({ deliveryId: "sample" }));
    const error = await routes
      .call("webhooks.webhookPost", {
        params: { hookId: "sample-hook", token: "sample-secret-token" },
        headers: { "x-sample-signature": "sample-secret-value\r\nx-other: 1" },
      })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(T3PreconditionError);
    expect(NodeUtil.inspect(error, { depth: null })).not.toContain("sample-secret");
    expect(requests).toHaveLength(0);
  });

  it("reads the params of a webhook endpoint path", () => {
    expect(webhookUrlParams("/api/hooks/sample%2Fhook/sample-token")).toEqual({
      hookId: "sample/hook",
      token: "sample-token",
    });
    for (const path of [
      "/api/assets/a/b",
      "/api/hooks/a",
      "/api/hooks/a/b/c",
      "/api/hooks/%invalid/b",
      "/api/hooks/a/%invalid",
    ]) {
      expect(() => webhookUrlParams(path)).toThrow(T3PreconditionError);
    }
  });
});
