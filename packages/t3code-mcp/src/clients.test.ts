// ---
// relationships:
//   verifies: mcp
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import { memoryCredentialStore, T3Client, T3PreconditionError } from "@wyrd-company/t3code-lib";
import { SharedClient } from "./clients.ts";

afterEach(() => vi.restoreAllMocks());
const resolved = {
  baseUrl: "http://127.0.0.1:1",
  credentials: memoryCredentialStore(),
  sources: { server: "profile", credentials: "profile" },
} as const;
function fixture() {
  const client = T3Client.create({ baseUrl: resolved.baseUrl });
  const close = vi.spyOn(client, "close").mockResolvedValue();
  const profiles = {
    resolve: vi.fn().mockResolvedValue(resolved),
    resolveProfile: vi.fn().mockResolvedValue(resolved),
  };
  const create = vi.fn().mockResolvedValue(client);
  return { client, close, profiles, create };
}

it("shares concurrent initialization and exact named profile selection", async () => {
  const f = fixture();
  const clients = new SharedClient({ profile: "sample" }, f.profiles, f.create);
  const values = await Promise.all([clients.get(), clients.get()]);
  expect(values).toEqual([f.client, f.client]);
  expect(f.profiles.resolveProfile).toHaveBeenCalledExactlyOnceWith("sample");
  expect(f.profiles.resolve).not.toHaveBeenCalled();
  expect(f.create).toHaveBeenCalledOnce();
  await Promise.all([clients.close(), clients.close()]);
  expect(f.close).toHaveBeenCalledOnce();
  await expect(clients.get()).rejects.toMatchObject({ code: "connection" });
});

it("permits retry after failed initialization without retaining the failure", async () => {
  const f = fixture();
  f.profiles.resolve.mockRejectedValueOnce(new Error("sample failure"));
  const clients = new SharedClient({ server: resolved.baseUrl }, f.profiles, f.create);
  await expect(clients.get()).rejects.toThrow("sample failure");
  expect(await clients.get()).toBe(f.client);
  expect(f.create).toHaveBeenCalledOnce();
  await clients.close();
});

it("closes a client whose initialization finishes during shutdown", async () => {
  const f = fixture();
  let release!: (client: T3Client) => void;
  const pending = new Promise<T3Client>((resolve) => {
    release = resolve;
  });
  const clients = new SharedClient({}, f.profiles, () => pending);
  const getting = clients.get();
  const rejected = expect(getting).rejects.toMatchObject({ code: "interrupted" });
  const closing = clients.close();
  release(f.client);
  await Promise.all([rejected, closing]);
  expect(f.close).toHaveBeenCalledOnce();
});

it("cancels one waiter without cancelling another waiter's shared client", async () => {
  const f = fixture();
  let release!: (client: T3Client) => void;
  const pending = new Promise<T3Client>((resolve) => {
    release = resolve;
  });
  const clients = new SharedClient({}, f.profiles, () => pending);
  const controller = new AbortController();
  const cancelled = clients.get(controller.signal);
  const rejected = expect(cancelled).rejects.toMatchObject({ code: "interrupted" });
  const other = clients.get();
  controller.abort();
  release(f.client);
  await rejected;
  expect(await other).toBe(f.client);
  await clients.close();
});

it("rejects conflicting or blank selection without resolving credentials", () => {
  for (const options of [
    { profile: "sample", server: resolved.baseUrl },
    { profile: "sample", credentialsFile: "sample.json" },
    { server: " " },
  ]) {
    expect(() => new SharedClient(options)).toThrow(T3PreconditionError);
  }
});
