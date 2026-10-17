// ---
// relationships:
//   verifies: profiles
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  ProfileManager,
  T3Client,
  T3ConnectionError,
  T3PreconditionError,
  memoryCredentialStore,
} from "../index.ts";
import { credentialPath, saveConfig } from "./profileConfig.ts";

let directory: string;
const url = "https://server.example";
const secondUrl = "https://other.example";
const auth = {
  policy: "remote-reachable",
  bootstrapMethods: ["one-time-token"],
  sessionMethods: ["bearer-access-token"],
  sessionCookieName: "session",
};
const fetchSession: typeof fetch = async () =>
  new Response(JSON.stringify({ authenticated: true, auth, scopes: ["orchestration:read"] }));
const manager = () =>
  new ProfileManager({ configDir: directory, clientOptions: { fetch: fetchSession } });
const tokenFor = async (options: Awaited<ReturnType<ProfileManager["resolve"]>>) => {
  const client = T3Client.create(options);
  try {
    return await client.auth.currentAccessToken();
  } finally {
    await client.close();
  }
};

beforeEach(async () => {
  directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-profiles-unit-"));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await NodeFSP.rm(directory, { recursive: true, force: true });
});

async function registerTwo() {
  const profiles = manager();
  await profiles.setAccessToken({ name: "first", url }, "first-token");
  await profiles.setAccessToken({ name: "second", url: secondUrl }, "second-token");
  return profiles;
}

describe("profile configuration", () => {
  it("uses absolute XDG configuration home and ignores a relative XDG value", () => {
    vi.stubEnv("T3C_CONFIG_HOME", undefined);
    vi.stubEnv("XDG_CONFIG_HOME", directory);
    expect(new ProfileManager().configDir).toBe(NodePath.join(directory, "t3c"));
    vi.stubEnv("T3C_CONFIG_HOME", NodePath.join(directory, "override"));
    expect(new ProfileManager().configDir).toBe(NodePath.join(directory, "override"));
    vi.stubEnv("T3C_CONFIG_HOME", undefined);
    vi.stubEnv("XDG_CONFIG_HOME", "relative");
    expect(new ProfileManager().configDir).toBe(NodePath.join(NodeOS.homedir(), ".config/t3c"));
  });

  it("treats missing config as empty and requires a selected server", async () => {
    expect(await manager().list()).toEqual([]);
    expect(await manager().getCurrent()).toBeUndefined();
    await expect(manager().resolve({ env: {} })).rejects.toBeInstanceOf(T3PreconditionError);
    const resolved = await manager().resolve({ server: url, env: {} });
    expect(resolved.baseUrl).toBe(url);
    expect(await tokenFor(resolved)).toBeUndefined();
  });

  it("stores separate 0600 credentials, preserves current and switches explicitly", async () => {
    const profiles = await registerTwo();
    expect(await profiles.getCurrent()).toEqual({ name: "first", url });
    expect(await profiles.list()).toHaveLength(2);
    expect(await tokenFor(await profiles.resolve({ env: {} }))).toBe("first-token");
    await profiles.switch("second");
    expect(await tokenFor(await profiles.resolve({ env: {} }))).toBe("second-token");
    for (const name of ["first", "second"]) {
      expect((await NodeFSP.stat(credentialPath(directory, name))).mode & 0o777).toBe(0o600);
    }
    expect((await NodeFSP.stat(NodePath.join(directory, "config.json"))).mode & 0o777).toBe(0o644);
    const config = await NodeFSP.readFile(NodePath.join(directory, "config.json"), "utf8");
    expect(config).not.toContain("token");
  });

  it("does not register a failed authentication", async () => {
    const profiles = new ProfileManager({
      configDir: directory,
      clientOptions: {
        fetch: async () => new Response(JSON.stringify({ authenticated: false, auth })),
      },
    });
    await expect(
      profiles.setAccessToken({ name: "first", url }, "bad-token"),
    ).rejects.toMatchObject({ code: "auth_invalid" });
    expect(await profiles.list()).toEqual([]);
    expect(await profiles.getCurrent()).toBeUndefined();
    await expect(NodeFSP.stat(credentialPath(directory, "first"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("logs out the selected profile without switching to another", async () => {
    const profiles = await registerTwo();
    await profiles.logout();
    expect(await profiles.getCurrent()).toBeUndefined();
    expect(await profiles.list()).toEqual([{ name: "second", url: secondUrl }]);
    await expect(NodeFSP.stat(credentialPath(directory, "first"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await profiles.switch("second");
    await expect(profiles.switch("absent")).rejects.toBeInstanceOf(T3PreconditionError);
    await expect(profiles.logout("absent")).rejects.toBeInstanceOf(T3PreconditionError);
  });

  it.each([
    "{ token: secret",
    '{"servers": []}',
    '{"servers":{"first":{"url":"not a URL"}}}',
    '{"servers":{},"current":"absent"}',
  ])("rejects malformed configuration without its contents: %s", async (text) => {
    await NodeFSP.writeFile(NodePath.join(directory, "config.json"), text);
    await expect(manager().list()).rejects.toBeInstanceOf(T3PreconditionError);
    try {
      await manager().list();
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain("secret");
      expect(String(error)).not.toContain("secret");
    }
  });

  it("wraps failed config reads and writes as library errors", async () => {
    await NodeFSP.mkdir(NodePath.join(directory, "config.json"));
    await expect(manager().list()).rejects.toBeInstanceOf(T3ConnectionError);
    await NodeFSP.rm(NodePath.join(directory, "config.json"), { recursive: true });
    await NodeFSP.writeFile(NodePath.join(directory, "credentials"), "blocked");
    await expect(
      manager().setAccessToken({ name: "first", url }, "sample-token"),
    ).rejects.toBeInstanceOf(T3ConnectionError);
  });

  it("supports profile names without interpreting them as file paths or object prototypes", async () => {
    const profiles = manager();
    for (const name of ["../sample", "__proto__", "constructor"]) {
      await profiles.setAccessToken({ name, url }, "sample-token");
      expect(NodePath.dirname(credentialPath(directory, name))).toBe(
        NodePath.join(directory, "credentials"),
      );
    }
    expect(await profiles.list()).toHaveLength(3);
    await profiles.switch("__proto__");
    expect((await profiles.getCurrent())?.name).toBe("__proto__");
  });
});

describe("profile resolution", () => {
  it("resolves server flags before environment before current", async () => {
    const profiles = await registerTwo();
    expect((await profiles.resolve({ env: {} })).baseUrl).toBe(url);
    expect(await tokenFor(await profiles.resolve({ env: { T3_SERVER_URL: secondUrl } }))).toBe(
      "second-token",
    );
    expect(
      await tokenFor(
        await profiles.resolve({ server: url + "/", env: { T3_SERVER_URL: secondUrl } }),
      ),
    ).toBe("first-token");
    expect(
      await tokenFor(await profiles.resolve({ server: "https://unknown.example", env: {} })),
    ).toBeUndefined();
  });

  it("applies T3_TOKEN alone to current and credential file before environment token", async () => {
    const profiles = await registerTwo();
    const options = await profiles.resolve({ env: { T3_TOKEN: "override-token" } });
    expect(options.baseUrl).toBe(url);
    expect(options.sources).toEqual({ server: "profile", credentials: "environment" });
    expect(await tokenFor(options)).toBe("override-token");
    const resolved = await profiles.resolve({
      credentialsFile: credentialPath(directory, "second"),
      env: { T3_TOKEN: "override-token" },
    });
    expect(await tokenFor(resolved)).toBe("second-token");
    expect(resolved.sources).toEqual({ server: "profile", credentials: "file" });
    expect(await tokenFor(await profiles.resolve({ env: {} }))).toBe("first-token");
  });

  it("preserves explicit blank inputs as invalid instead of falling back", async () => {
    const profiles = await registerTwo();
    await expect(
      profiles.resolve({ server: "", env: { T3_SERVER_URL: url } }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
  });

  it("uses a pluggable store and leaves credential reads and writes to AuthClient", async () => {
    const store = memoryCredentialStore();
    const source = vi.fn(() => store);
    const load = vi.spyOn(store, "load");
    const profiles = new ProfileManager({
      configDir: directory,
      credentialSource: source,
      clientOptions: { fetch: fetchSession },
    });
    await profiles.setAccessToken({ name: "first", url }, "custom-token");
    const before = load.mock.calls.length;
    const resolved = await profiles.resolve({ env: {} });
    expect(load).toHaveBeenCalledTimes(before);
    expect(await tokenFor(resolved)).toBe("custom-token");
    expect(source).toHaveBeenCalledWith({ name: "first", url }, credentialPath(directory, "first"));
    await profiles.logout();
    expect(await store.load()).toEqual({});
  });
  it("resolves an exact named profile when names share one URL without environment overrides", async () => {
    const profiles = manager();
    await profiles.setAccessToken({ name: "first", url }, "first-token");
    await profiles.setAccessToken({ name: "second", url }, "second-token");
    vi.stubEnv("T3_TOKEN", "override-token");
    vi.stubEnv("T3_SERVER_URL", secondUrl);
    const resolved = await profiles.resolveProfile("second");
    expect(resolved.profile?.name).toBe("second");
    expect(resolved.baseUrl).toBe(url);
    expect(resolved.sources).toEqual({ server: "profile", credentials: "profile" });
    expect(await tokenFor(resolved)).toBe("second-token");
    expect(await tokenFor(await profiles.resolve({ server: url, env: {} }))).toBe("first-token");
    expect((await profiles.getCurrent())?.name).toBe("first");
    await expect(profiles.resolveProfile("absent")).rejects.toBeInstanceOf(T3PreconditionError);
  });

  it("reports selection sources for explicit and environment URLs", async () => {
    const profiles = await registerTwo();
    expect((await profiles.resolve({ server: url, env: {} })).sources).toEqual({
      server: "flag",
      credentials: "profile",
    });
    expect((await profiles.resolve({ env: { T3_SERVER_URL: secondUrl } })).sources).toEqual({
      server: "environment",
      credentials: "profile",
    });
    expect(
      (await profiles.resolve({ server: "https://unknown.example", env: {} })).sources,
    ).toEqual({ server: "flag", credentials: "none" });
  });

  it("rejects empty profile names and non-HTTP server URLs", async () => {
    await expect(
      manager().setAccessToken({ name: "", url }, "sample-token"),
    ).rejects.toBeInstanceOf(T3PreconditionError);
    await expect(
      manager().resolve({ server: "ftp://server.example", env: {} }),
    ).rejects.toBeInstanceOf(T3PreconditionError);
  });

  it("uses the URL parser to normalize host case and default ports", async () => {
    const profiles = await registerTwo();
    expect(
      await tokenFor(await profiles.resolve({ server: "https://SERVER.example:443/", env: {} })),
    ).toBe("first-token");
  });

  it("keeps explicit credential-file failures typed without falling back to a profile", async () => {
    const profiles = await registerTwo();
    const path = NodePath.join(directory, "override.json");
    await NodeFSP.writeFile(path, '{"accessToken":"sample-secret",');
    const resolved = await profiles.resolve({ credentialsFile: path, env: {} });
    await expect(tokenFor(resolved)).rejects.toMatchObject({ code: "decode" });
    await NodeFSP.rm(path);
    expect(
      await tokenFor(await profiles.resolve({ credentialsFile: path, env: {} })),
    ).toBeUndefined();
  });

  it("wraps a credential source failure without exposing its message", async () => {
    await registerTwo();
    const profiles = new ProfileManager({
      configDir: directory,
      credentialSource: () => {
        throw new Error("sample-secret");
      },
    });
    await expect(profiles.resolve({ env: {} })).rejects.toBeInstanceOf(T3ConnectionError);
    try {
      await profiles.resolve({ env: {} });
    } catch (error) {
      expect(String(error)).not.toContain("sample-secret");
    }
  });

  it("wraps config write failures and removes temporary files", async () => {
    await NodeFSP.mkdir(NodePath.join(directory, "config.json"));
    await expect(saveConfig(directory, { servers: {} })).rejects.toBeInstanceOf(T3ConnectionError);
    expect(await NodeFSP.readdir(directory)).toEqual(["config.json"]);
  });
});
