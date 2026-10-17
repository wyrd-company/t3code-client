// ---
// relationships:
//   verifies: profiles
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { ProfileManager, T3Client, T3PreconditionError } from "../index.ts";
import { credentialPath } from "./profileConfig.ts";
import { environmentValue } from "./environment.ts";

let directory: string;
const url = "https://server.example";
const fetchSession: typeof fetch = async () =>
  new Response(
    JSON.stringify({
      authenticated: true,
      auth: {
        policy: "remote-reachable",
        bootstrapMethods: ["one-time-token"],
        sessionMethods: ["bearer-access-token"],
        sessionCookieName: "session",
      },
    }),
  );
const manager = () =>
  new ProfileManager({ configDir: directory, clientOptions: { fetch: fetchSession } });
async function tokenFor(options: Awaited<ReturnType<ProfileManager["resolve"]>>) {
  const client = T3Client.create(options);
  try {
    return await client.auth.currentAccessToken();
  } finally {
    await client.close();
  }
}
beforeEach(async () => {
  directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-env-unit-"));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await NodeFSP.rm(directory, { recursive: true, force: true });
});

it.each(["", " \t "])("blank config overrides use XDG storage: %j", async (blank) => {
  vi.stubEnv("T3C_CONFIG_HOME", blank);
  vi.stubEnv("XDG_CONFIG_HOME", directory);
  const profiles = new ProfileManager({ clientOptions: { fetch: fetchSession } });
  const expected = NodePath.join(directory, "t3c");
  // Assert before authentication so a broken guard cannot write into the checkout.
  expect(profiles.configDir).toBe(expected);
  await profiles.setAccessToken({ name: "sample", url }, "stored-token");
  expect((await NodeFSP.stat(NodePath.join(expected, "config.json"))).mode & 0o777).toBe(0o644);
  expect((await NodeFSP.stat(credentialPath(expected, "sample"))).mode & 0o777).toBe(0o600);
});

it.each(["", " \t "])(
  "blank server environment falls through to current profile: %j",
  async (blank) => {
    const profiles = manager();
    await profiles.setAccessToken({ name: "sample", url }, "stored-token");
    const resolved = await profiles.resolve({ env: { T3_SERVER_URL: blank } });
    expect(resolved.baseUrl).toBe(url);
    expect(resolved.sources.server).toBe("profile");
  },
);

it.each(["", " \t "])(
  "blank token environment falls through to stored credentials: %j",
  async (blank) => {
    const profiles = manager();
    await profiles.setAccessToken({ name: "sample", url }, "stored-token");
    const resolved = await profiles.resolve({ env: { T3_TOKEN: blank } });
    expect(await tokenFor(resolved)).toBe("stored-token");
    expect(resolved.sources.credentials).toBe("profile");
    const fromFile = await profiles.resolve({
      credentialsFile: credentialPath(directory, "sample"),
      env: { T3_TOKEN: blank },
    });
    expect(await tokenFor(fromFile)).toBe("stored-token");
    expect(fromFile.sources.credentials).toBe("file");
  },
);

it.each(["", " \t "])("blank environment does not invent a server or bearer: %j", async (blank) => {
  const profiles = manager();
  await expect(
    profiles.resolve({ env: { T3_SERVER_URL: blank, T3_TOKEN: blank } }),
  ).rejects.toBeInstanceOf(T3PreconditionError);
  const resolved = await profiles.resolve({
    server: url,
    env: { T3_SERVER_URL: blank, T3_TOKEN: blank },
  });
  expect(resolved.sources).toEqual({ server: "flag", credentials: "none" });
  expect(await tokenFor(resolved)).toBeUndefined();
});

it("preserves nonblank environment values verbatim", () => {
  expect(environmentValue({ SAMPLE_VALUE: " value " }, "SAMPLE_VALUE")).toBe(" value ");
});

it("treats absent environment inputs as unset", () => {
  expect(environmentValue({}, "SAMPLE_VALUE")).toBeUndefined();
});
