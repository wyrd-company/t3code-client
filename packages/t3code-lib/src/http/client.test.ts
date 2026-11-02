// ---
// relationships:
//   verifies: library-transport
// ---
import * as NodeUtil from "node:util";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { generateDpopKey } from "../auth/dpop.ts";
import { T3AuthError, T3Error, T3NotFoundError, T3PreconditionError } from "../errors.ts";
import { commandId, projectId, threadId } from "../schemas/common.ts";
import type { AuthBrowserSessionResult } from "../schemas/auth.ts";
import { HttpTransport } from "../transport/http.ts";
import { callRoute, HttpRouteClient } from "./client.ts";
import { assetUrlParams, attachmentUploadUrlParams } from "./routes/assets.ts";
import { httpRoutes, type HttpRoutes } from "./registry.ts";
import type { HttpRouteSuccess } from "./spec.ts";

const session = {
  authenticated: true,
  scopes: ["orchestration:read"],
  sessionMethod: "browser-session-cookie",
  expiresAt: "2030-01-02T03:04:05.000Z",
};

function setup(body: unknown, scopes?: string[]) {
  const requests: Request[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    requests.push(new Request(input, init));
    return Response.json(body);
  });
  const http = new HttpTransport({
    baseUrl: "https://host.invalid",
    fetch,
    getAccessToken: async () => "sample-token",
  });
  const routes = new HttpRouteClient(http, httpRoutes, { getScopes: () => scopes });
  return { fetch, http, requests, routes };
}

describe("HttpRouteClient", () => {
  it("fills the path, sends the query and the protocol header, and decodes the answer", async () => {
    const { requests, routes } = setup({ ticket: "sample", expiresAt: session.expiresAt });
    await routes.call("auth.webSocketTicketFor", { params: { use: "media" } });
    expect(new URL(requests[0]?.url ?? "").pathname).toBe("/api/auth/websocket-ticket/media");
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer sample-token");
  });

  it("encodes a path value and keeps the query of a bounded snapshot", async () => {
    const { requests, routes } = setup({});
    await routes
      .call("orchestration.threadBoundedSnapshot", {
        params: { threadId: threadId("thread/1") },
        query: { deferWork: "1", compactTurnItems: "1" },
      })
      .catch(() => undefined);
    const url = new URL(requests[0]?.url ?? "");
    expect(url.pathname).toBe("/api/orchestration/threads/thread%2F1/bounded");
    expect(url.searchParams.get("deferWork")).toBe("1");
    expect(url.searchParams.get("compactTurnItems")).toBe("1");
    expect(requests[0]?.headers.get("x-t3-orchestration-protocol") ?? "").not.toBe("");
  });

  it("refuses an input outside the schema without sending it", async () => {
    const { fetch, routes } = setup({});
    await expect(
      routes.call("orchestration.threadBoundedSnapshot", {
        params: { threadId: threadId("thread-1") },
        // The compact id wire form is not offered.
        query: { compactIds: "1" } as never,
      }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
    await expect(
      routes.call("auth.webSocketTicketFor", { params: { use: "other" as "rpc" } }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks the route scope and the scope of the input when the scopes are known", async () => {
    const mutation = {
      type: "project.update" as const,
      commandId: commandId("command-1"),
      projectId: projectId("project-1"),
      scripts: [],
    };
    const operator = setup({}, ["orchestration:operate"]);
    await expect(operator.routes.call("projects.mutate", { body: mutation })).rejects.toMatchObject(
      { code: "insufficient_scope", requiredScope: "settings:write" },
    );
    const reader = setup({}, ["orchestration:read"]);
    await expect(reader.routes.call("projects.snapshot")).rejects.toBeInstanceOf(Error);
    await expect(
      reader.routes.call("projects.mutate", {
        body: {
          type: "project.delete",
          commandId: commandId("command-1"),
          projectId: projectId("project-1"),
        },
      }),
    ).rejects.toBeInstanceOf(T3AuthError);
    expect(reader.fetch).toHaveBeenCalledTimes(1);
    expect(operator.fetch).not.toHaveBeenCalled();
  });

  it("types the answer of a route by its name", () => {
    expectTypeOf<
      HttpRouteSuccess<HttpRoutes, "auth.browserSession">
    >().toEqualTypeOf<AuthBrowserSessionResult>();
  });
});

describe("callRoute", () => {
  it("form-encodes a token exchange and signs it with the supplied key", async () => {
    const { http, requests } = setup({
      access_token: "sample-access",
      issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
      token_type: "DPoP",
      expires_in: 60,
      scope: "orchestration:read",
    });
    await callRoute(
      http,
      httpRoutes["auth.token"],
      {
        body: {
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: "sample-subject",
          subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
          requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        },
      },
      { dpopKey: generateDpopKey() },
    );
    const request = requests[0];
    expect(request?.headers.get("content-type")).toContain("application/x-www-form-urlencoded");
    expect(await request?.text()).toContain("subject_token=sample-subject");
    expect(request?.headers.get("dpop")?.split(".")).toHaveLength(3);
    // A token exchange presents no access token.
    expect(request?.headers.get("authorization")).toBeNull();
  });
});

describe("signed file routes", () => {
  const token = "c2FtcGxl.c2lnbmF0dXJl";

  function setupAnswer(answer: () => Response) {
    const requests: Request[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      requests.push(new Request(input, init));
      return answer();
    });
    const http = new HttpTransport({
      baseUrl: "https://host.invalid",
      fetch,
      getAccessToken: async () => "sample-token",
    });
    return { requests, routes: new HttpRouteClient(http, httpRoutes) };
  }

  it("reads an asset as bytes, with no session token", async () => {
    const bytes = new Uint8Array([0, 255, 1]);
    const { requests, routes } = setupAnswer(
      () => new Response(bytes, { headers: { "content-type": "image/png" } }),
    );
    const content = await routes.call("assets.read", {
      params: assetUrlParams(`/api/assets/${token}/a%20b%2Fc.png`),
    });
    expect(content).toEqual({ bytes, contentType: "image/png" });
    expect(new URL(requests[0]?.url ?? "").pathname).toBe(`/api/assets/${token}/a%20b%2Fc.png`);
    expect(requests[0]?.headers.get("authorization")).toBeNull();
  });

  it("uploads raw bytes, with no session token, and accepts the empty answer", async () => {
    const { requests, routes } = setupAnswer(() => new Response(null, { status: 204 }));
    const answer = await routes.call("attachments.upload", {
      params: attachmentUploadUrlParams(`/api/attachments/upload/${token}`),
      body: new Uint8Array([7, 8]),
    });
    expect(answer).toBeUndefined();
    const request = requests[0];
    expect(request?.headers.get("authorization")).toBeNull();
    expect(request?.headers.get("content-type")).toBe("application/octet-stream");
    expect(new Uint8Array((await request?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array([7, 8]),
    );
  });

  it("keeps the signed token out of an error", async () => {
    const { routes } = setupAnswer(() => new Response("Not Found", { status: 404 }));
    const error = await routes
      .call("assets.read", { params: { token, path: "a.png" } })
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(T3NotFoundError);
    expect((error as T3NotFoundError).path).toBe("/api/assets/:token/:path");
    expect(String((error as Error).message)).not.toContain(token);
  });

  it("keeps the signed token out of the whole error when the request cannot start", async () => {
    const failing: typeof globalThis.fetch = async (input) => {
      throw new TypeError(`Request cannot be constructed from ${String(input)}`);
    };
    const reachable = new HttpTransport({
      baseUrl: "https://host.invalid",
      fetch: failing,
      getAccessToken: async () => undefined,
    });
    const unreadable = new HttpTransport({
      baseUrl: "https://host.invalid",
      fetch: async () =>
        new Response(
          new ReadableStream({
            start: (controller) => {
              controller.error(new Error(`Lost ${token}`));
            },
          }),
        ),
      getAccessToken: async () => undefined,
    });
    const invalid = new HttpTransport({
      baseUrl: "not a base",
      getAccessToken: async () => undefined,
    });
    for (const http of [reachable, unreadable, invalid]) {
      const error = await new HttpRouteClient(http, httpRoutes)
        .call("assets.read", { params: { token, path: "a.png" } })
        .catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(T3Error);
      expect(NodeUtil.inspect(error, { depth: 10 })).not.toContain(token);
    }
  });

  it("refuses a dot segment, a malformed token and a URL of another route", async () => {
    const { routes } = setupAnswer(() => new Response(null));
    await expect(routes.call("assets.read", { params: { token, path: ".." } })).rejects.toThrow(
      T3PreconditionError,
    );
    await expect(
      routes.call("assets.read", { params: { token: "..", path: "a.png" } }),
    ).rejects.toThrow(T3PreconditionError);
    expect(() => assetUrlParams(`/api/other/${token}/a.png`)).toThrow(T3PreconditionError);
    expect(() => assetUrlParams(`/api/assets/${token}`)).toThrow(T3PreconditionError);
    expect(() => assetUrlParams(`/api/assets/${token}/%`)).toThrow(T3PreconditionError);
    expect(() => attachmentUploadUrlParams(`/api/assets/${token}/a.png`)).toThrow(
      T3PreconditionError,
    );
  });
});
