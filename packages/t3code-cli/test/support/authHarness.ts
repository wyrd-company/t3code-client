// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { vi } from "vite-plus/test";
import { ProfileManager } from "@wyrd-company/t3code-lib";
import { FakeT3Server } from "../../../t3code-lib/test/support/fakeServer.ts";
import { main } from "../../src/main.ts";
import { authHandlers } from "../../src/auth.ts";
import type { CommandSurface } from "../../src/registration.ts";

export const auth = {
  policy: "remote-reachable",
  bootstrapMethods: ["one-time-token"],
  sessionMethods: ["bearer-access-token"],
  sessionCookieName: "session",
};
export const expiry = "2099-01-01T00:00:00.000Z";
export async function authHarness() {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-auth-unit-"));
  const server = await FakeT3Server.start();
  const profiles = new ProfileManager({ configDir: directory });
  vi.stubEnv("T3C_CONFIG_HOME", directory);
  vi.stubEnv("T3_SERVER_URL", "");
  vi.stubEnv("T3_TOKEN", "");
  server.routes.route("GET /.well-known/t3/environment", () => ({
    status: 200,
    body: {
      environmentId: "sample-environment",
      label: "Sample server",
      platform: { os: "linux", arch: "x64" },
      serverVersion: "0.1.0",
      capabilities: {},
    },
  }));
  server.routes.route("GET /api/auth/session", (request) => {
    const token = request.headers["authorization"];
    return {
      status: 200,
      body: {
        authenticated: Boolean(token) && token !== "Bearer rejected",
        auth,
        scopes:
          token === "Bearer second-token" ? ["orchestration:operate"] : ["orchestration:read"],
        expiresAt: expiry,
      },
    };
  });
  server.routes.route("POST /oauth/token", () => ({
    status: 200,
    body: {
      access_token: "paired-token",
      token_type: "Bearer",
      issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
      expires_in: 3600,
      scope: "orchestration:read",
    },
  }));
  const surface = JSON.parse(
    await NodeFSP.readFile(
      new URL("../../../../docs/specifications/cli-surface.json", import.meta.url),
      "utf8",
    ),
  ) as CommandSurface;
  return {
    directory,
    server,
    profiles,
    async invoke(args: string[]) {
      let stdout = "";
      let stderr = "";
      const code = await main(
        [...args, "--json"],
        surface,
        {
          stdout: (s) => {
            stdout += s;
          },
          stderr: (s) => {
            stderr += s;
          },
        },
        authHandlers,
      );
      return { code, stdout, stderr, result: JSON.parse(stdout) };
    },
    async register(name = "first", token = "first-token", url = server.httpUrl) {
      await profiles.setAccessToken({ name, url }, token);
    },
    async close() {
      vi.unstubAllEnvs();
      await server.close();
      await NodeFSP.rm(directory, { recursive: true, force: true });
    },
  };
}
