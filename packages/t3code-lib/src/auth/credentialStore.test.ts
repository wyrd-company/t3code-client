// ---
// relationships:
//   implements: design
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import { describe, expect, it } from "vite-plus/test";

import { T3ConnectionError, T3DecodeError } from "../errors.ts";
import { fileCredentialStore, memoryCredentialStore } from "./credentialStore.ts";

const credentials = {
  accessToken: "credential-1",
  scopes: ["orchestration:read" as const],
  expiresAt: "2030-01-02T03:04:05.000Z",
  sessionMethod: "bearer-access-token" as const,
};

describe("credential stores", () => {
  it("keeps memory values isolated from caller mutation", async () => {
    const store = memoryCredentialStore(credentials);
    const loaded = await store.load();
    loaded.scopes?.push("access:read");
    expect(await store.load()).toEqual(credentials);
    await store.clear();
    expect(await store.load()).toEqual({});
  });

  it("round trips a mode-0600 file and treats a missing file as empty", async () => {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "credential-store-"));
    const path = NodePath.join(directory, "credentials.json");
    try {
      const store = fileCredentialStore(path);
      expect(await store.load()).toEqual({});
      await store.save(credentials);
      expect(await store.load()).toEqual(credentials);
      expect((await NodeFSP.stat(path)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await NodeFSP.readFile(path, "utf8"))).toEqual(credentials);
      await store.clear();
      expect(await store.load()).toEqual({});
    } finally {
      await NodeFSP.rm(directory, { recursive: true, force: true });
    }
  });
  it("redacts malformed credential JSON and wraps store I/O failures", async () => {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "credential-errors-"));
    const path = NodePath.join(directory, "credentials.json");
    try {
      await NodeFSP.writeFile(path, '{"accessToken":"sample-secret",');
      const store = fileCredentialStore(path);
      await expect(store.load()).rejects.toBeInstanceOf(T3DecodeError);
      try {
        await store.load();
      } catch (error) {
        expect(JSON.stringify(error)).not.toContain("sample-secret");
        expect(String(error)).not.toContain("sample-secret");
      }
      await NodeFSP.rm(path);
      await NodeFSP.mkdir(path);
      await expect(store.load()).rejects.toBeInstanceOf(T3ConnectionError);
      await expect(store.save(credentials)).rejects.toBeInstanceOf(T3ConnectionError);
      await expect(store.clear()).rejects.toBeInstanceOf(T3ConnectionError);
      expect(await NodeFSP.readdir(directory)).toEqual(["credentials.json"]);
    } finally {
      await NodeFSP.rm(directory, { recursive: true, force: true });
    }
  });
});
