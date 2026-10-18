// ---
// relationships:
//   verifies: mcp
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  memoryCredentialStore,
  T3Client,
  T3PreconditionError,
  type CredentialStore,
} from "@wyrd-company/t3code-lib";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { config } from "../../test/support/fakes.ts";
import { createServer } from "../server.ts";
import { CredentialRedactor } from "./credentials.ts";
import { ServerRegistry } from "./registry.ts";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

it.each(["profile", "tokenEnv"])(
  "redacts a replaced %s credential from HTTP rejection text and structured content",
  async (source) => {
    const credentials = memoryCredentialStore({ accessToken: "sample-original-value" });
    let clientStore: CredentialStore | undefined;
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const token = new Headers(init?.headers).get("authorization")?.slice(7);
      return Response.json({ reason: `Rejected ${token}` }, { status: 401 });
    });
    const registry = new ServerRegistry(
      config({
        servers: {
          alpha:
            source === "profile"
              ? {}
              : {
                  url: "https://server.example",
                  tokenEnv: "SAMPLE_TOKEN",
                },
        },
      }),
      {
        env: { SAMPLE_TOKEN: "sample-original-value" },
        profiles: {
          resolveProfile: async () => ({
            baseUrl: "https://server.example",
            credentials,
            sources: { server: "profile", credentials: "profile" },
          }),
        },
        create: (options) => {
          clientStore = options.credentials;
          return T3Client.create({ ...options, fetch });
        },
      },
    );
    closers.push(() => registry.close());
    await vi.waitFor(async () => {
      expect((await registry.error(new T3PreconditionError("Ready"))).message).toBe("Ready");
    });
    // Open the library client before replacing the shared profile's credential.
    await registry.client("alpha", "thread_read");
    await (source === "profile" ? credentials : clientStore!).save({
      accessToken: "sample-replacement-value",
    });
    const server = createServer(registry);
    const client = new Client({ name: "sample-client", version: "0.0.0" });
    closers.push(
      () => client.close(),
      () => server.close(),
    );
    const [clientWire, serverWire] = InMemoryTransport.createLinkedPair();
    await server.connect(serverWire);
    await client.connect(clientWire);
    const result = await client.callTool({
      name: "thread_read",
      arguments: { threadId: "thread-1" },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get("authorization")).toBe(
      "Bearer sample-replacement-value",
    );
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "auth_invalid", message: expect.stringContaining("Rejected [redacted]") },
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain("sample-replacement-value");
    expect(JSON.stringify(result.content)).not.toContain("sample-replacement-value");
    expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toEqual(
      result.structuredContent,
    );
  },
);

it("records credential strings before a failing save and retains them after clear", async () => {
  const redactor = new CredentialRedactor(
    config(),
    { resolveProfile: vi.fn() },
    {},
    new AbortController().signal,
  );
  const messages: string[] = [];
  const save = vi.fn(async () => {
    messages.push(redactor.error(new T3PreconditionError("Echo sample-saved-value")).message);
    throw new T3PreconditionError("Echo sample-saved-value");
  });
  const clear = vi.fn(async () => {});
  const store = redactor.recording("alpha", { load: async () => ({}), save, clear });
  await expect(store.save({ accessToken: "sample-saved-value" })).rejects.toThrow(
    "sample-saved-value",
  );
  expect(messages).toEqual(["Echo [redacted]"]);
  expect(redactor.error(new T3PreconditionError("Echo sample-saved-value")).message).toBe(
    "Echo [redacted]",
  );
  expect(save).toHaveBeenCalledWith({ accessToken: "sample-saved-value" });
  await store.clear();
  expect(clear).toHaveBeenCalledOnce();
  expect(redactor.error(new T3PreconditionError("Echo sample-saved-value")).message).toBe(
    "Echo [redacted]",
  );
});

it("records every string in an extended credential shape before returning a load", async () => {
  const redactor = new CredentialRedactor(
    config(),
    { resolveProfile: vi.fn() },
    {},
    new AbortController().signal,
  );
  const credentials = {
    accessToken: "sample-access-value",
    refreshToken: "sample-refresh-value",
    extra: { secret: "sample-extra-value" },
  };
  const store = redactor.recording("alpha", {
    load: async () => credentials,
    save: vi.fn(),
    clear: vi.fn(),
  });
  expect(await store.load()).toBe(credentials);
  expect(
    redactor.error(
      new T3PreconditionError("Echo sample-access-value sample-refresh-value sample-extra-value"),
    ).message,
  ).toBe("Echo [redacted] [redacted] [redacted]");
});
