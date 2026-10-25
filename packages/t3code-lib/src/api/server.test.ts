import * as NodeFS from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { T3DecodeError } from "../errors.ts";
import { ServerConfigStreamEvent } from "../schemas/server.ts";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { ServerProviderUsageLimits } from "../schemas/provider.ts";
import { HttpTransport } from "../transport/http.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { ServerApi } from "./server.ts";

const fixture = (name: string): unknown =>
  JSON.parse(
    NodeFS.readFileSync(new URL(`../../test/fixtures/${name}.json`, import.meta.url), "utf8"),
  );

describe("ServerApi", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let api: ServerApi;

  beforeEach(async () => {
    server = await FakeT3Server.start();
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    api = new ServerApi(
      new RpcClient(connection, rpcMethods),
      new HttpTransport({
        baseUrl: server.httpUrl,
        getAccessToken: async () => undefined,
      }),
    );
  });

  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("gets the server config and unauthenticated environment descriptor", async () => {
    const config = fixture("server-config") as Record<string, unknown>;
    const environment = fixture("environment");
    server.respond("server.getConfig", config);
    server.routes.route("GET /.well-known/t3/environment", () => ({
      status: 200,
      body: environment,
    }));

    await expect(api.getConfig()).resolves.toMatchObject({ cwd: "/srv/sample" });
    await expect(api.environment()).resolves.toMatchObject({ label: "sample-environment" });
    expect(server.routes.requests[0]?.headers["authorization"]).toBeUndefined();
  });

  it("decodes the Scratch and new-project roots and a usage credential fingerprint", async () => {
    const config = fixture("server-config") as Record<string, unknown>;
    server.respond("server.getConfig", {
      ...config,
      scratchWorkspaceRoot: "/tmp/example-home/scratch",
      newProjectsRoot: "/tmp/example-home/projects",
    });
    await expect(api.getConfig()).resolves.toMatchObject({
      scratchWorkspaceRoot: "/tmp/example-home/scratch",
      newProjectsRoot: "/tmp/example-home/projects",
    });
    expect(
      ServerProviderUsageLimits.parse({
        checkedAt: "2026-01-01T00:00:00.000Z",
        windows: [],
        credentialFingerprint: "fingerprint-1",
      }).credentialFingerprint,
    ).toBe("fingerprint-1");
  });

  it("reads recent stall metadata and preserves stream decode errors before a later snapshot", async () => {
    const config = fixture("server-config") as Record<string, unknown>;
    const stall = {
      detectedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 2500,
      cpuCount: 2,
      loadAverage: 1.5,
      future: "preserved",
    };
    const present = { ...config, lastEventLoopStall: stall };
    const malformed = { ...config, lastEventLoopStall: null };
    server.respond("server.getConfig", present);
    await expect(api.getConfig()).resolves.toMatchObject({ lastEventLoopStall: stall });
    server.respond("server.getConfig", malformed);
    await expect(api.getConfig()).rejects.toBeInstanceOf(T3DecodeError);
    server.handle("subscribeServerConfig", () => ({
      kind: "stream",
      chunks: [config, malformed, present].map((config) => [
        { version: 1, type: "snapshot", config },
      ]),
    }));
    const snapshots = [];
    let errors = 0;
    for await (const item of api.watchConfig()) {
      if ("kind" in item && item.kind === "decode-error" && "error" in item) {
        expect(item.error).toBeInstanceOf(T3DecodeError);
        errors += 1;
        continue;
      }
      const event = ServerConfigStreamEvent.parse(item);
      if ("unknown" in event) throw new Error("Expected a known config event");
      if (event.type !== "snapshot") throw new Error("Expected a config snapshot");
      snapshots.push(event.config);
    }
    expect(errors).toBe(1);
    expect(snapshots).toHaveLength(2);
    expect(Object.hasOwn(snapshots[0] ?? {}, "lastEventLoopStall")).toBe(false);
    expect(snapshots[1]?.lastEventLoopStall).toEqual(stall);
  });

  it("reads direct endpoint metadata and preserves stream decode errors before a later snapshot", async () => {
    const config = fixture("server-config") as Record<string, unknown>;
    delete config["directEndpoints"];
    const endpoints = [
      {
        kind: "lan",
        httpBaseUrl: "http://192.168.1.2:3000/",
        future: "preserved",
      },
    ];
    const present = { ...config, directEndpoints: endpoints };
    const malformed = { ...config, directEndpoints: null };
    server.respond("server.getConfig", present);
    await expect(api.getConfig()).resolves.toMatchObject({ directEndpoints: endpoints });
    server.respond("server.getConfig", malformed);
    await expect(api.getConfig()).rejects.toBeInstanceOf(T3DecodeError);
    server.handle("subscribeServerConfig", () => ({
      kind: "stream",
      chunks: [config, malformed, present].map((config) => [
        { version: 1, type: "snapshot", config },
      ]),
    }));
    const snapshots = [];
    let errors = 0;
    for await (const item of api.watchConfig()) {
      if ("kind" in item && item.kind === "decode-error" && "error" in item) {
        expect(item.error).toBeInstanceOf(T3DecodeError);
        errors += 1;
        continue;
      }
      const event = ServerConfigStreamEvent.parse(item);
      if ("unknown" in event) throw new Error("Expected a known config event");
      if (event.type !== "snapshot") throw new Error("Expected a config snapshot");
      snapshots.push(event.config);
    }
    expect(errors).toBe(1);
    expect(snapshots).toHaveLength(2);
    expect(Object.hasOwn(snapshots[0] ?? {}, "directEndpoints")).toBe(false);
    expect(snapshots[1]?.directEndpoints).toEqual(endpoints);
  });

  it("finds a provider model by slug or alias", async () => {
    const config = fixture("server-config") as {
      providers: Array<{ instanceId: string; models: Array<{ slug: string; aliases?: string[] }> }>;
    };
    // The first provider in the fixture that offers a model.
    const provider = config.providers.find((candidate) => candidate.models.length > 0);
    const model = provider?.models[0];
    if (!provider || !model) throw new Error("The fixture has no provider with a model.");
    model.aliases = [...(model.aliases ?? []), "sample-alias"];
    server.respond("server.getConfig", config);

    await expect(api.findModel(provider.instanceId, model.slug)).resolves.toMatchObject({
      model: { slug: model.slug },
    });
    await expect(api.findModel(provider.instanceId, "sample-alias")).resolves.toMatchObject({
      model: { slug: model.slug },
    });
    await expect(api.findModel(provider.instanceId, "no-such-model")).resolves.toBeUndefined();
    await expect(api.findModel("no-such-provider", model.slug)).resolves.toBeUndefined();
  });

  it("unwraps lifecycle events and preserves decode errors from separate chunks", async () => {
    const environment = fixture("environment");
    server.handle("subscribeServerLifecycle", () => ({
      kind: "stream",
      chunks: [
        [
          {
            version: 1,
            sequence: 1,
            type: "ready",
            payload: { at: "2026-01-01T00:00:00.000Z", environment },
          },
        ],
        [{ version: 1, sequence: 2, type: "ready", payload: {} }],
      ],
    }));

    const items = [];
    for await (const item of api.watchLifecycle()) items.push(item);

    expect(items[0]).toMatchObject({ type: "ready", sequence: 1 });
    expect(items[1]).toMatchObject({ kind: "decode-error" });
  });
});
