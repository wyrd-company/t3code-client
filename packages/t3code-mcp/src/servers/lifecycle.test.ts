// ---
// relationships:
//   verifies: mcp
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import { memoryCredentialStore, T3PreconditionError } from "@wyrd-company/t3code-lib";
import { config, fakeClient } from "../../test/support/fakes.ts";
import { SERVER_DEADLINE_MS } from "./acquisition.ts";
import { ServerRegistry } from "./registry.ts";

afterEach(() => vi.useRealTimers());
const connection = () => ({
  baseUrl: "https://server.example",
  credentials: memoryCredentialStore({ accessToken: "sample-credential" }),
  sources: { server: "profile" as const, credentials: "profile" as const },
});
const never = () => new Promise<never>(() => {});

it("closes acquired clients without joining a hung profile open", async () => {
  vi.useFakeTimers();
  const fake = fakeClient();
  const registry = new ServerRegistry(config({ servers: { alpha: {}, beta: {} } }), {
    profiles: {
      resolveProfile: vi.fn(async (name) => (name === "alpha" ? connection() : never())),
    },
    create: () => fake.client,
  });
  await registry.client("alpha", "thread_read");
  const opening = expect(registry.client("beta", "thread_read")).rejects.toThrow("closed");
  let closed = false;
  void registry.close().then(() => {
    closed = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(closed).toBe(true);
  expect(fake.close).toHaveBeenCalledTimes(1);
  await opening;
  expect(vi.getTimerCount()).toBe(0);
});

it("evicts timed out acquisitions and retries without joining the old open", async () => {
  vi.useFakeTimers();
  const resolveProfile = vi.fn(async (): Promise<ReturnType<typeof connection>> => never());
  const fake = fakeClient();
  const registry = new ServerRegistry(config({ servers: { alpha: {} } }), {
    profiles: { resolveProfile },
    create: () => fake.client,
  });
  const first = expect(registry.client("alpha", "thread_read")).rejects.toThrow("5 s deadline");
  expect(SERVER_DEADLINE_MS).toBe(5000);
  await vi.advanceTimersByTimeAsync(SERVER_DEADLINE_MS);
  await first;
  resolveProfile.mockImplementation(async () => connection());
  expect(await registry.client("alpha", "thread_read")).toBe(fake.client);
  await registry.close();
  expect(fake.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("evicts an abandoned open immediately while preserving other acquisition callers", async () => {
  vi.useFakeTimers();
  const resolveProfile = vi.fn(async (): Promise<ReturnType<typeof connection>> => never());
  const fake = fakeClient();
  const registry = new ServerRegistry(config({ servers: { alpha: {} } }), {
    profiles: { resolveProfile },
    create: () => fake.client,
  });
  const first = new AbortController();
  const second = new AbortController();
  const a = expect(registry.client("alpha", "thread_read", first.signal)).rejects.toThrow("first");
  const b = expect(registry.client("alpha", "thread_read", second.signal)).rejects.toThrow(
    "second",
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(resolveProfile).toHaveBeenCalledTimes(2); // Startup snapshot and one shared open.
  first.abort(new Error("first"));
  await a;
  expect(resolveProfile).toHaveBeenCalledTimes(2);
  second.abort(new Error("second"));
  await b;
  resolveProfile.mockImplementation(async () => connection());
  expect(await registry.client("alpha", "thread_read")).toBe(fake.client);
  expect(resolveProfile).toHaveBeenCalledTimes(3);
  await registry.close();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["shutdown", "cancellation"])("closes a client arriving during %s", async (cause) => {
  const fake = fakeClient();
  const controller = new AbortController();
  const registry = new ServerRegistry(config(), {
    env: { SAMPLE_TOKEN: "sample-credential" },
    create: () => {
      if (cause === "shutdown") void registry.close();
      else controller.abort(new Error("cancelled"));
      return fake.client;
    },
  });
  await expect(registry.client("alpha", "thread_read", controller.signal)).rejects.toThrow();
  await vi.waitFor(() => expect(fake.close).toHaveBeenCalledTimes(1));
  await registry.close();
  expect(fake.close).toHaveBeenCalledTimes(1);
});

it("does not create a client when an abandoned profile resolves after shutdown", async () => {
  let release!: (value: ReturnType<typeof connection>) => void;
  const profile = new Promise<ReturnType<typeof connection>>((resolve) => {
    release = resolve;
  });
  const create = vi.fn(() => fakeClient().client);
  const registry = new ServerRegistry(config({ servers: { alpha: {} } }), {
    profiles: { resolveProfile: () => profile },
    create,
  });
  const opening = expect(registry.client("alpha", "thread_read")).rejects.toThrow("closed");
  await registry.close();
  await opening;
  release(connection());
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(create).not.toHaveBeenCalled();
});

it.each(["profile", "credentials"])(
  "formats errors immediately despite hung peer %s I/O",
  async (stage) => {
    vi.useFakeTimers();
    const resolveProfile = vi.fn(async () =>
      stage === "profile"
        ? never()
        : {
            ...connection(),
            credentials: { load: never, save: vi.fn(), clear: vi.fn() },
          },
    );
    const registry = new ServerRegistry(config({ servers: { alpha: {} } }), {
      profiles: { resolveProfile },
    });
    let message: string | undefined;
    void registry.error(new T3PreconditionError("sample-private-value")).then((error) => {
      message = error.message;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(message).toBe("The upstream operation failed.");
    await vi.advanceTimersByTimeAsync(SERVER_DEADLINE_MS);
    expect((await registry.error(new T3PreconditionError("sample-private-value"))).message).toBe(
      "The upstream operation failed.",
    );
    expect(resolveProfile).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await registry.close();
  },
);
