// ---
// relationships:
//   verifies: mcp
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { loadConfig } from "./loadConfig.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => NodeFSP.rm(p, { recursive: true, force: true })));
});
async function file(value: unknown) {
  const root = await NodeFSP.mkdtemp("/tmp/mcp-config-");
  roots.push(root);
  const path = NodePath.join(root, "config.json");
  await NodeFSP.writeFile(path, JSON.stringify(value));
  return path;
}
it("resolves flags over environment over file over profiles", async () => {
  const path = await file({
    servers: { alpha: {}, beta: { profile: "alternate" } },
    allowTools: ["project_*"],
    readOnly: true,
  });
  const resolved = await loadConfig(
    { config: path, servers: ["alpha"], allowTools: ["thread_*"], readOnly: false },
    {
      env: {
        T3CODE_MCP_SERVERS: "beta",
        T3CODE_MCP_ALLOW_TOOLS: "server_*",
        T3CODE_MCP_READ_ONLY: "1",
      },
    },
  );
  expect(Object.keys(resolved.servers)).toEqual(["alpha"]);
  expect(resolved.allowTools).toEqual(["thread_*"]);
  expect(resolved.readOnly).toBe(false);
  expect(
    (
      await loadConfig(
        { config: path },
        { env: { T3CODE_MCP_ALLOW_TOOLS: "server_*", T3CODE_MCP_READ_ONLY: "0" } },
      )
    ).readOnly,
  ).toBe(false);
});
it("loads profiles only when no server map exists and tolerates a missing default file", async () => {
  const root = await NodeFSP.mkdtemp("/tmp/mcp-config-");
  roots.push(root);
  const profiles = { list: async () => [{ name: "alpha", url: "https://server.example" }] };
  expect((await loadConfig({}, { home: root, env: {}, profiles })).servers).toEqual({ alpha: {} });
  expect(
    (await loadConfig({ config: await file({ servers: {} }) }, { profiles, env: {} })).servers,
  ).toEqual({});
});
it("rejects explicit missing files, invalid JSON, secrets and unknown selections without echoing config", async () => {
  const path = await file({
    servers: { alpha: { url: "https://server.example", token: "sample-secret" } },
  });
  await expect(loadConfig({ config: path })).rejects.toThrow("Invalid MCP config shape");
  await NodeFSP.writeFile(path, "invalid-json-sample-secret");
  await expect(loadConfig({ config: path })).rejects.toThrow("Could not load MCP config");
  await expect(loadConfig({ config: `${path}.absent` })).rejects.toThrow("Could not load");
  const valid = await file({ servers: { alpha: {} } });
  await expect(loadConfig({ config: valid, servers: ["absent"] })).rejects.toThrow(
    "not configured",
  );
  await expect(loadConfig({ config: valid, defaultServer: "absent" })).rejects.toThrow(
    "not selected",
  );
});
it("accepts tokenEnv URL entries and validates read-only environment values", async () => {
  const path = await file({
    servers: { alpha: { url: "https://server.example", tokenEnv: "SAMPLE_TOKEN" } },
  });
  expect(
    (await loadConfig({}, { env: { T3CODE_MCP_CONFIG: path } })).servers["alpha"],
  ).toHaveProperty("tokenEnv");
  await expect(
    loadConfig({ config: path }, { env: { T3CODE_MCP_READ_ONLY: "yes" } }),
  ).rejects.toThrow("0 or 1");
});
