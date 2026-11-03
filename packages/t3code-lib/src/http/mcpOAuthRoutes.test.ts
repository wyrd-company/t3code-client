// ---
// relationships:
//   verifies: library-transport
// ---
import * as NodeUtil from "node:util";
import { describe, expect, it, vi } from "vite-plus/test";

import { T3ConnectionError, T3DecodeError, T3HttpError, T3PreconditionError } from "../errors.ts";
import { AuthMcpApprovalResult } from "../schemas/authMcp.ts";
import { HttpTransport } from "../transport/http.ts";
import { HttpRouteClient } from "./client.ts";
import { httpRoutes } from "./registry.ts";

function setup(answer: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const http = new HttpTransport({
    baseUrl: "https://host.invalid",
    fetch: vi.fn<typeof globalThis.fetch>(async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return answer();
    }),
    getAccessToken: async () => "sample-token",
  });
  return { calls, routes: new HttpRouteClient(http, httpRoutes) };
}

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("Expected a refusal.");
    },
    (error: unknown) => error as Error,
  );

const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

const query = { response_type: "code", state: "sample-state" };

describe("mcpOAuth.authorize", () => {
  it("does not follow the redirect, and answers with where it points", async () => {
    const { calls, routes } = setup(() => redirect("/connect-agent?state=sample-state"));

    await expect(routes.call("mcpOAuth.authorize", { query })).resolves.toEqual({
      location: "/connect-agent?state=sample-state",
    });
    expect(calls[0]?.init.redirect).toBe("manual");
    expect(new URL(calls[0]?.url ?? "").searchParams.get("state")).toBe("sample-state");
    expect(new Headers(calls[0]?.init.headers).has("authorization")).toBe(false);
  });

  it("raises T3HttpError with the page of a refused link", async () => {
    const { routes } = setup(() => new Response("<p>Sample page</p>", { status: 400 }));

    const error = await failure(routes.call("mcpOAuth.authorize", { query }));

    expect(error).toBeInstanceOf(T3HttpError);
    expect((error as T3HttpError).body).toBe("<p>Sample page</p>");
    expect((error as T3HttpError).path).toBe("/oauth/mcp/authorize");
  });

  it("raises a decode error for a redirect with no location and for a 2xx answer", async () => {
    const empty = setup(() => new Response(null, { status: 302 }));
    expect(await failure(empty.routes.call("mcpOAuth.authorize", { query }))).toBeInstanceOf(
      T3DecodeError,
    );

    const page = setup(() => new Response("<p>Sample page</p>"));
    expect(await failure(page.routes.call("mcpOAuth.authorize", { query }))).toBeInstanceOf(
      T3DecodeError,
    );
  });

  it("refuses when the fetch hides the redirect, as a browser's does", async () => {
    const opaque = { type: "opaqueredirect", status: 0, ok: false } as Response;
    const { routes } = setup(() => opaque);

    expect(await failure(routes.call("mcpOAuth.authorize", { query }))).toBeInstanceOf(
      T3PreconditionError,
    );
  });

  it("keeps the query out of a failure to send", async () => {
    const http = new HttpTransport({
      baseUrl: "https://host.invalid",
      fetch: vi.fn<typeof globalThis.fetch>(async (input) => {
        throw new Error(`Sample failure for ${String(input)}`);
      }),
      getAccessToken: async () => undefined,
    });
    const routes = new HttpRouteClient(http, httpRoutes);

    const error = await failure(routes.call("mcpOAuth.authorize", { query }));

    expect(error).toBeInstanceOf(T3ConnectionError);
    expect(NodeUtil.inspect(error, { depth: 8 })).not.toContain("sample-state");
  });
});

it("still raises T3HttpError for a redirect on a route that does not read one", async () => {
  const { calls, routes } = setup(() => redirect("/sample"));

  const error = await failure(routes.call("mcpOAuth.token", { body: {} }));

  expect(error).toBeInstanceOf(T3HttpError);
  expect(calls[0]?.init.redirect).toBeUndefined();
});

it("sends a token request form-encoded, with no session token", async () => {
  const { calls, routes } = setup(() =>
    Response.json({
      access_token: "sample-token",
      token_type: "Bearer",
      expires_in: 60,
      scope: "orchestration:read",
    }),
  );

  await routes.call("mcpOAuth.token", {
    body: { grant_type: "authorization_code", code: "sample-code" },
  });

  const init = calls[0]?.init;
  expect(new Headers(init?.headers).get("content-type")).toBe("application/x-www-form-urlencoded");
  expect(new Headers(init?.headers).has("authorization")).toBe(false);
  expect(String(init?.body)).toBe("grant_type=authorization_code&code=sample-code");
});

it("keeps the code of an approval's redirect out of a decode error", async () => {
  const redirectTo = "https://app.invalid/back?code=sample-code";
  const { routes } = setup(() => Response.json({ redirectTo, extra: 1 }));
  const bad = setup(() => Response.json({ redirectTo: 1, sample: redirectTo }));
  const body = { authorization: {}, decision: { _tag: "deny" as const } };

  await expect(routes.call("mcpOAuth.decision", { body })).resolves.toMatchObject({ redirectTo });
  const error = await failure(bad.routes.call("mcpOAuth.decision", { body }));

  expect(error).toBeInstanceOf(T3DecodeError);
  expect(NodeUtil.inspect((error as T3DecodeError).raw)).not.toContain("sample-code");
});

it("decodes either answer of an approval", () => {
  const details = { clientName: "Sample", redirectHost: "a.invalid", environmentHost: "b.invalid" };
  expect(AuthMcpApprovalResult.parse(details)).toEqual(details);
  expect(
    AuthMcpApprovalResult.parse({ ...details, csrfToken: "sample", oneClickAccess: ["newer"] }),
  ).toMatchObject({ oneClickAccess: ["newer"] });
  expect(AuthMcpApprovalResult.parse({ redirectTo: "https://a.invalid" })).toEqual({
    redirectTo: "https://a.invalid",
  });
  expect(AuthMcpApprovalResult.safeParse({ clientName: "Sample" }).success).toBe(false);
});

it("refuses a decision with an access that the server does not name", async () => {
  const { routes } = setup(() => Response.json({}));
  const decision = { _tag: "pairing-code", access: "newer", code: "sample-code" };
  const error = await failure(
    routes.call("mcpOAuth.decision", { body: { authorization: {}, decision } } as never),
  );

  expect(error).toBeInstanceOf(T3PreconditionError);
  expect(error.message).not.toContain("sample-code");
});
