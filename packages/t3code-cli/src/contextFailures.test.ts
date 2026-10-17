// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  memoryCredentialStore,
  ProfileManager,
  T3Client,
  T3TimeoutError,
} from "@wyrd-company/t3code-lib";
import { main, type InvocationHandler } from "./main.ts";
import type { CommandSurface } from "./registration.ts";

const surface = JSON.parse(
  await NodeFSP.readFile(
    new URL("../../../docs/specifications/assets/cli-surface.json", import.meta.url),
    "utf8",
  ),
) as CommandSurface;
afterEach(() => vi.restoreAllMocks());
async function reader(handler: InvocationHandler) {
  const lines: string[] = [],
    errors: string[] = [];
  const exit = await main(
    ["run", "sample", "--json"],
    surface,
    {
      stdout: (s) => {
        lines.push(s);
      },
      stderr: (s) => {
        errors.push(s);
      },
    },
    { run: handler },
  );
  expect(lines).toHaveLength(1);
  return { exit, result: JSON.parse(lines[0]!), errors };
}
function expectFailure(
  actual: Awaited<ReturnType<typeof reader>>,
  exit: number,
  code: string,
  message: string,
) {
  expect(actual.exit).toBe(exit);
  expect(actual.result).toEqual({
    threadId: null,
    runId: null,
    state: "unknown",
    assistantMessage: null,
    pendingRequests: [],
    durationMs: expect.any(Number),
    exitCode: exit,
    error: { code, message },
  });
  expect(actual.errors).toEqual([`t3c: ${message}\n`]);
}

// Real profile storage: config and credential I/O fail as library T3StorageError (storage => 1).
it.each(["resolve", "load", "save", "clear"] as const)(
  "reader maps real %s storage failure to local exit 1",
  async (operation) => {
    const dir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-context-"));
    vi.stubEnv("T3C_CONFIG_HOME", dir);
    vi.stubEnv("T3_SERVER_URL", "");
    vi.stubEnv("T3_TOKEN", "");
    if (operation === "resolve") await NodeFSP.mkdir(NodePath.join(dir, "config.json"));
    else {
      await NodeFSP.writeFile(
        NodePath.join(dir, "config.json"),
        JSON.stringify({ servers: { sample: { url: "http://127.0.0.1:1" } }, current: "sample" }),
      );
      const key = NodeCrypto.createHash("sha256").update("sample").digest("hex");
      await NodeFSP.mkdir(NodePath.join(dir, "credentials", `${key}.json`), { recursive: true });
    }
    const create = vi.spyOn(T3Client, "create");
    let context: string | undefined;
    try {
      const actual = await reader(async (_args, _command, invocation) => {
        invocation.errorContext = "run-interrupt";
        try {
          if (operation === "resolve") await invocation.resolve();
          else {
            await invocation.client();
            const credentials = create.mock.lastCall![0].credentials!;
            if (operation === "save") await credentials.save({});
            else await credentials[operation]();
          }
        } finally {
          context = invocation.errorContext;
        }
      });
      expect(context, "failure selects local context").toBe("local");
      expectFailure(actual, 1, "storage", "Command failed.");
    } finally {
      vi.unstubAllEnvs();
      await NodeFSP.rm(dir, { recursive: true, force: true });
    }
  },
);

it("reader maps real refused transport to connection exit 8", async () => {
  // An owned server reserves a port, then closes it before the transport tries it.
  const NodeNet = await import("node:net");
  const server = NodeNet.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected TCP address");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  vi.spyOn(ProfileManager.prototype, "resolve").mockResolvedValue({
    baseUrl: `http://127.0.0.1:${address.port}`,
    credentials: memoryCredentialStore(),
    sources: { server: "flag", credentials: "none" },
  });
  let context: string | undefined;
  const actual = await reader(async (_args, _command, invocation) => {
    try {
      await (await invocation.client()).server.environment();
    } finally {
      context = invocation.errorContext;
    }
  });
  expect(context).toBe("connection");
  expectFailure(actual, 8, "connection", "Server connection failed.");
});

it.each(["resolve", "client"] as const)(
  "reader retries %s after shared resolution failure",
  async (method) => {
    const fail = new Error("sample local failure");
    const resolve = vi
      .spyOn(ProfileManager.prototype, "resolve")
      .mockRejectedValueOnce(fail)
      .mockResolvedValue({
        baseUrl: "http://127.0.0.1:1",
        credentials: memoryCredentialStore(),
        sources: { server: "flag", credentials: "none" },
      });
    const actual = await reader(async (_args, _command, invocation) => {
      invocation.errorContext = "run-detach";
      const outcomes = await Promise.allSettled([invocation[method](), invocation[method]()]);
      expect(outcomes).toEqual([
        { status: "rejected", reason: fail },
        { status: "rejected", reason: fail },
      ]);
      expect(invocation.errorContext).toBe("local");
      invocation.errorContext = "run-detach";
      await invocation[method]();
      throw new T3TimeoutError("sample deadline");
    });
    expect(resolve).toHaveBeenCalledTimes(2);
    expectFailure(actual, 5, "timeout", "Timed out; run remains active.");
  },
);

it("reader retries client creation after failure without resolving profiles again", async () => {
  const resolve = vi.spyOn(ProfileManager.prototype, "resolve").mockResolvedValue({
    baseUrl: "http://127.0.0.1:1",
    credentials: memoryCredentialStore(),
    sources: { server: "flag", credentials: "none" },
  });
  const originalCreate = T3Client.create;
  const fail = new Error("sample creation failure");
  const create = vi
    .spyOn(T3Client, "create")
    .mockImplementationOnce(() => {
      throw fail;
    })
    .mockImplementation(originalCreate);
  const actual = await reader(async (_args, _command, invocation) => {
    invocation.errorContext = "run-detach";
    expect(await Promise.allSettled([invocation.client(), invocation.client()])).toEqual([
      { status: "rejected", reason: fail },
      { status: "rejected", reason: fail },
    ]);
    expect(invocation.errorContext).toBe("local");
    invocation.errorContext = "run-detach";
    await invocation.client();
    throw new T3TimeoutError("sample deadline");
  });
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledTimes(2);
  expectFailure(actual, 5, "timeout", "Timed out; run remains active.");
});

it("closes a client whose creation is still in flight at close", async () => {
  let release: (() => void) | undefined;
  vi.spyOn(ProfileManager.prototype, "resolve").mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () =>
          resolve({
            baseUrl: "http://127.0.0.1:1",
            credentials: memoryCredentialStore(),
            sources: { server: "flag", credentials: "none" },
          });
      }),
  );
  const originalCreate = T3Client.create;
  const closes: unknown[] = [];
  const create = vi.spyOn(T3Client, "create").mockImplementation((options) => {
    const client = originalCreate(options);
    closes.push(vi.spyOn(client, "close"));
    return client;
  });
  const { createInvocation } = await import("./context.ts");
  const { Output } = await import("./output.ts");
  const invocation = createInvocation({}, new Output({ stdout: () => {}, stderr: () => {} }));
  const pending = invocation.client();
  const closing = invocation.close();
  release!();
  await pending;
  await closing;
  expect(create).toHaveBeenCalledTimes(1);
  expect(closes[0]).toHaveBeenCalledTimes(1);
});
