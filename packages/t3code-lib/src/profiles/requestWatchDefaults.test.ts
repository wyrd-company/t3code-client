// ---
// relationships:
//   verifies: profiles
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { ProfileManager, T3PreconditionError } from "../index.ts";

const url = "https://server.example";
const defaults = {
  projectIds: ["project-1"],
  kind: "approval",
  excludeThreadIds: ["thread-1"],
  excludeTags: ["reviewer"],
};
let directory: string;
let configPath: string;
let profiles: ProfileManager;

beforeEach(async () => {
  directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-watch-defaults-"));
  configPath = NodePath.join(directory, "config.json");
  profiles = new ProfileManager({ configDir: directory });
});

afterEach(async () => {
  await NodeFSP.rm(directory, { recursive: true, force: true });
});

async function writeConfig(server: { url: string; requestWatch?: unknown }) {
  const text = JSON.stringify({ servers: { sample: server }, current: "sample" });
  await NodeFSP.writeFile(configPath, text);
  return text;
}

it("loads the previous config shape and leaves the file byte for byte", async () => {
  const original = await writeConfig({ url });
  expect((await profiles.resolve({ env: {} })).profile).toEqual({ name: "sample", url });
  expect(await profiles.requestWatchDefaults("sample")).toEqual({});
  expect(await NodeFSP.readFile(configPath, "utf8")).toBe(original);
});

it("normalizes the supported filters and ignores unknown keys", async () => {
  await writeConfig({
    url,
    requestWatch: {
      projectIds: [" project-1 "],
      kind: "approval",
      excludeThreadIds: [" thread-1 "],
      excludeTags: [" reviewer "],
      exec: "exit 3",
    },
  });
  expect(await profiles.requestWatchDefaults("sample")).toEqual(defaults);
  expect(await profiles.list()).toEqual([{ name: "sample", url }]);
  expect((await profiles.resolveProfile("sample")).baseUrl).toBe(url);
});

it.each([
  null,
  false,
  [],
  { projectIds: "project-1" },
  { projectIds: [" "] },
  { kind: "sample-secret" },
  { excludeThreadIds: [null] },
  { excludeTags: ["reviewer\nworker"] },
])("rejects malformed defaults only when reading those defaults (%j)", async (requestWatch) => {
  const original = await writeConfig({ url, requestWatch });
  expect((await profiles.resolve({ env: {} })).profile).toEqual({ name: "sample", url });
  const reading = profiles.requestWatchDefaults("sample");
  await expect(reading).rejects.toBeInstanceOf(T3PreconditionError);
  await expect(reading).rejects.toThrow(/^Invalid requestWatch defaults for profile "sample"\.$/u);
  expect(await NodeFSP.readFile(configPath, "utf8")).toBe(original);
});

it("preserves profile keys across credential registration and switching until logout", async () => {
  const server = { url, requestWatch: defaults, extra: { sample: true } };
  await writeConfig(server);
  profiles = new ProfileManager({
    configDir: directory,
    clientOptions: {
      fetch: async (_input, init) =>
        Response.json(
          init?.method === "POST"
            ? {
                access_token: "pair-session-token",
                token_type: "Bearer",
                issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
                expires_in: 3600,
                scope: "orchestration:read",
              }
            : {
                authenticated: true,
                auth: {
                  policy: "remote-reachable",
                  bootstrapMethods: ["one-time-token"],
                  sessionMethods: ["bearer-access-token"],
                  sessionCookieName: "session",
                },
              },
        ),
    },
  });
  const readConfig = async () => JSON.parse(await NodeFSP.readFile(configPath, "utf8"));
  const pairedUrl = "https://paired.example";
  await profiles.pair({ name: "sample", url: pairedUrl }, "pair-token");
  expect(await readConfig()).toEqual({
    servers: { sample: { ...server, url: pairedUrl } },
    current: "sample",
  });
  await profiles.setAccessToken({ name: "sample", url }, "sample-session-token");
  expect(await readConfig()).toEqual({ servers: { sample: server }, current: "sample" });
  await profiles.setAccessToken({ name: "secondary", url: pairedUrl }, "secondary-session-token");
  await profiles.switch("secondary");
  expect(await readConfig()).toEqual({
    servers: { sample: server, secondary: { url: pairedUrl } },
    current: "secondary",
  });
  await profiles.logout("sample");
  expect(await readConfig()).toEqual({
    servers: { secondary: { url: pairedUrl } },
    current: "secondary",
  });
});
