// ---
// relationships:
//   verifies: mcp
// ---
import { expect, it, vi } from "vite-plus/test";
import { config, fakeClient } from "../../test/support/fakes.ts";
import { ServerRegistry } from "./registry.ts";
it("resolves default and only server, refuses unknown and ambiguous targets", () => {
  expect(new ServerRegistry(config()).resolve()).toBe("alpha");
  const registry = new ServerRegistry(config({ servers: { alpha: {}, beta: {} } }));
  expect(() => registry.resolve()).toThrow("Name a configured");
  expect(() => registry.resolve("missing")).toThrow("not configured");
  expect(
    new ServerRegistry(
      config({ servers: { alpha: {}, beta: {} }, defaultServer: "beta" }),
    ).resolve(),
  ).toBe("beta");
});
it("opens lazily, shares concurrent opens, retries failures and closes clients", async () => {
  const fake = fakeClient();
  const create = vi.fn(() => fake.client);
  const resolveProfile = vi
    .fn()
    .mockRejectedValueOnce(new Error("unavailable"))
    .mockResolvedValue({ baseUrl: "https://server.example" });
  const registry = new ServerRegistry(config({ servers: { alpha: {}, beta: {} } }), {
    profiles: { resolveProfile },
    create,
  });
  expect(create).not.toHaveBeenCalled();
  await expect(registry.client("alpha", "thread_read")).rejects.toThrow("unavailable");
  await Promise.all([
    registry.client("alpha", "thread_read"),
    registry.client("alpha", "thread_read"),
  ]);
  expect(create).toHaveBeenCalledTimes(1);
  await registry.client("beta", "thread_read");
  expect(create).toHaveBeenCalledTimes(2);
  await registry.close();
  expect(fake.close).toHaveBeenCalledTimes(2);
  await expect(registry.client("alpha", "thread_read")).rejects.toThrow("closed");
});
it("fails a denied tool before opening and never inherits a different server token", async () => {
  const create = vi.fn(() => fakeClient().client);
  const registry = new ServerRegistry(
    config({ serverPolicies: { alpha: { denyTools: ["thread_*"] } } }),
    { env: {}, create },
  );
  await expect(registry.client("alpha", "thread_send")).rejects.toThrow("denied");
  await expect(registry.client("alpha", "server_capabilities")).rejects.toThrow("unset");
  expect(create).not.toHaveBeenCalled();
});
