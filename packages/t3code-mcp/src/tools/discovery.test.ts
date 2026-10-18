// ---
// relationships:
//   verifies: mcp
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import { T3PreconditionError } from "@wyrd-company/t3code-lib";
import { config, fakeClient } from "../../test/support/fakes.ts";
import { ServerRegistry } from "../servers/registry.ts";
import { discoveryTools, PROBE_DEADLINE_MS } from "./discovery.ts";
afterEach(() => vi.useRealTimers());
it.each(["open", "environment", "config"])(
  "bounds a hung %s while probing healthy peers",
  async (stage) => {
    vi.useFakeTimers();
    expect(PROBE_DEADLINE_MS).toBe(5000);
    const healthy = fakeClient();
    const hung = fakeClient();
    const never = () => new Promise<never>(() => {});
    if (stage === "environment") hung.server.environment.mockImplementation(never);
    if (stage === "config") hung.server.getConfig.mockImplementation(never);
    const registry = new ServerRegistry(
      config({
        servers: {
          alpha: { url: "https://server.example", tokenEnv: "SAMPLE_TOKEN" },
          beta: { url: "https://other.example", tokenEnv: "SAMPLE_TOKEN" },
        },
      }),
      {
        env: { SAMPLE_TOKEN: "sample-credential" },
        create: (options) => (options.baseUrl.includes("other") ? hung.client : healthy.client),
      },
    );
    if (stage === "open") {
      const original = registry.client.bind(registry);
      vi.spyOn(registry, "client").mockImplementation((server, tool) =>
        server === "beta" ? never() : original(server, tool),
      );
    }
    const result = discoveryTools[0]!.run(
      { probe: true },
      { registry, signal: new AbortController().signal },
    );
    await vi.advanceTimersByTimeAsync(PROBE_DEADLINE_MS);
    expect(await result).toMatchObject({
      servers: [
        { server: "alpha", reachable: true },
        {
          server: "beta",
          reachable: false,
          error: { code: "server_unreachable", message: "Server probe exceeded the 5 s deadline." },
        },
      ],
    });
    expect(vi.getTimerCount()).toBe(0);
  },
);

it.each(["profile-open", "error-redaction"])(
  "keeps a hung %s inside the probe deadline",
  async (stage) => {
    vi.useFakeTimers();
    const fake = fakeClient();
    if (stage === "error-redaction")
      fake.server.getConfig.mockRejectedValue(new T3PreconditionError("sample-private-value"));
    const registry = new ServerRegistry(
      config({
        servers: {
          alpha: { url: "https://server.example", tokenEnv: "SAMPLE_TOKEN" },
          beta: {},
        },
      }),
      {
        env: { SAMPLE_TOKEN: "sample-credential" },
        profiles: { resolveProfile: vi.fn(() => new Promise<never>(() => {})) },
        create: () => fake.client,
      },
    );
    const result = discoveryTools[0]!.run(
      { probe: true },
      { registry, signal: new AbortController().signal },
    );
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toMatchObject({
      servers: [
        { server: "alpha", reachable: stage === "profile-open" },
        { server: "beta", reachable: false, error: { code: "server_unreachable" } },
      ],
    });
    expect(JSON.stringify(await result)).not.toContain("sample-private-value");
    expect(vi.getTimerCount()).toBe(0);
  },
);
