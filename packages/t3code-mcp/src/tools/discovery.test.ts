// ---
// relationships:
//   verifies: mcp
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
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
