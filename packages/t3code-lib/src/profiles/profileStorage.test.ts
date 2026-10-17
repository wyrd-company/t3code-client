// ---
// relationships:
//   verifies: profiles
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import {
  ProfileManager,
  T3Client,
  T3ConnectionError,
  T3StorageError,
  memoryCredentialStore,
} from "../index.ts";
import { saveConfig } from "./profileConfig.ts";

let directory: string;
beforeEach(async () => {
  directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-profile-storage-"));
});
afterEach(async () => {
  await NodeFSP.rm(directory, { recursive: true, force: true });
});
const profile = { name: "sample", url: "https://server.example" };
it("classifies config I/O as storage with the original cause and path", async () => {
  await NodeFSP.mkdir(NodePath.join(directory, "config.json"));
  const manager = new ProfileManager({ configDir: directory });
  await expect(manager.list()).rejects.toMatchObject({
    code: "storage",
    cause: { code: "EISDIR" },
  });
  await expect(manager.list()).rejects.toThrow(directory);
  await expect(saveConfig(directory, { servers: {} })).rejects.toMatchObject({
    code: "storage",
    cause: { code: "EISDIR" },
  });
});
it("classifies backend load/clear/selection failures independently of HTTP connection failures", async () => {
  await saveConfig(directory, { servers: { sample: { url: profile.url } }, current: "sample" });
  const cause = new T3ConnectionError("open_failed", "sample backend failure");
  const fail = async (): Promise<never> => {
    throw cause;
  };
  const manager = new ProfileManager({
    configDir: directory,
    credentialSource: () => ({ load: fail, save: fail, clear: fail }),
  });
  const client = T3Client.create(await manager.resolveProfile("sample"));
  try {
    await expect(client.auth.currentAccessToken()).rejects.toMatchObject({
      code: "storage",
      cause,
    });
  } finally {
    await client.close();
  }
  await expect(manager.logout()).rejects.toBeInstanceOf(T3StorageError);
  const broken = new ProfileManager({ configDir: directory, credentialSource: fail });
  await expect(broken.resolveProfile("sample")).rejects.toMatchObject({ code: "storage", cause });
});
it("reports backend save failure after a successful pairing exchange as storage without registering", async () => {
  let exchanged = false;
  const cause = new Error("sample backend failure");
  const manager = new ProfileManager({
    configDir: directory,
    credentialSource: () => ({
      ...memoryCredentialStore(),
      save: async () => {
        throw cause;
      },
    }),
    clientOptions: {
      fetch: async () => {
        exchanged = true;
        return new Response(
          JSON.stringify({
            access_token: "sample-token",
            token_type: "Bearer",
            issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
            expires_in: 3600,
            scope: "orchestration:read",
          }),
        );
      },
    },
  });
  await expect(manager.pair(profile, "sample")).rejects.toMatchObject({ code: "storage", cause });
  expect(exchanged).toBe(true);
  expect(await manager.list()).toEqual([]);
});
it("preserves remote pair failures as connection with no profile registration", async () => {
  const manager = new ProfileManager({
    configDir: directory,
    clientOptions: {
      fetch: async () => {
        throw new Error("sample remote failure");
      },
    },
  });
  await expect(manager.pair(profile, "sample")).rejects.toMatchObject({ code: "connection" });
  expect(await manager.list()).toEqual([]);
});
it("classifies explicit credential-file I/O as storage", async () => {
  const path = NodePath.join(directory, "override.json");
  await NodeFSP.mkdir(path);
  const manager = new ProfileManager({ configDir: directory });
  const client = T3Client.create(
    await manager.resolve({ server: profile.url, credentialsFile: path, env: {} }),
  );
  try {
    await expect(client.auth.currentAccessToken()).rejects.toMatchObject({
      code: "storage",
      cause: { code: "connection" },
    });
  } finally {
    await client.close();
  }
});
