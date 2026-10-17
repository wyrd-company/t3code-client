// ---
// relationships:
//   verifies: profiles
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { ProfileManager } from "./profileManager.ts";
import { serverUrl } from "./profileConfig.ts";

it.each([
  "HTTPS://server.example",
  "https://SERVER.EXAMPLE",
  "https://server.example:443",
  "https://server.example/",
  "https://server.example/base/",
  "https://server.example?sample=value",
  "https://server.example#sample",
  "https://sample:sample-password@server.example/base?token=sample-secret#sample",
])("normalizes the server origin without extra URL components: %s", (input) => {
  expect(serverUrl(input)).toBe("https://server.example");
});

it("keeps a non-default server port", () => {
  expect(serverUrl("http://SERVER.example:8080/base?sample=value#sample")).toBe(
    "http://server.example:8080",
  );
});

it("stores normalized origins and applies them when reading and resolving profiles", async () => {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-profile-origins-"));
  const configPath = NodePath.join(directory, "config.json");
  const url = "https://SERVER.example:443/base?token=sample-secret#sample";
  const profiles = new ProfileManager({
    configDir: directory,
    clientOptions: {
      fetch: async () =>
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
        ),
    },
  });
  try {
    await profiles.setAccessToken({ name: "sample", url }, "sample-token");
    const saved = await NodeFSP.readFile(configPath, "utf8");
    expect(JSON.parse(saved)).toEqual({
      servers: { sample: { url: "https://server.example" } },
      current: "sample",
    });
    expect(saved).not.toContain("sample-secret");
    expect(await profiles.getCurrent()).toEqual({ name: "sample", url: "https://server.example" });
    expect((await profiles.resolve({ server: url, env: {} })).profile?.name).toBe("sample");
    // A caller-authored config uses the same normalization on every read path.
    await NodeFSP.writeFile(
      configPath,
      JSON.stringify({ servers: { sample: { url } }, current: "sample" }),
    );
    expect((await profiles.list())[0]?.url).toBe("https://server.example");
    expect((await profiles.resolve({ env: {} })).baseUrl).toBe("https://server.example");
    expect((await profiles.resolveProfile("sample")).baseUrl).toBe("https://server.example");
    await profiles.switch("sample");
    expect(await NodeFSP.readFile(configPath, "utf8")).not.toContain("sample-secret");
  } finally {
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});
