// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { authHarness } from "../test/support/authHarness.ts";

let h: Awaited<ReturnType<typeof authHarness>>;
beforeEach(async () => {
  h = await authHarness();
});
afterEach(async () => {
  await h.close();
  vi.restoreAllMocks();
});

it.each(["", " \t "])(
  "auth status falls through blank server/token environment %j without an empty bearer",
  async (blank) => {
    await h.register();
    vi.stubEnv("T3_SERVER_URL", blank);
    vi.stubEnv("T3_TOKEN", blank);
    const status = await h.invoke(["auth", "status"]);
    expect(status.code).toBe(0);
    expect(status.result.data.effective.sources).toEqual({
      server: "profile",
      credentials: "profile",
    });
    expect(
      h.server.routes.requests.findLast((r) => r.path === "/api/auth/session")?.headers[
        "authorization"
      ],
    ).toBe("Bearer first-token");
  },
);
it("auth status preserves flag/environment/profile precedence without persisting overrides", async () => {
  await h.register();
  const before = await NodeFSP.readFile(NodePath.join(h.directory, "config.json"), "utf8");
  vi.stubEnv("T3_SERVER_URL", h.server.httpUrl);
  vi.stubEnv("T3_TOKEN", "environment-token");
  let status = await h.invoke(["auth", "status"]);
  expect(status.result.data.effective.sources).toEqual({
    server: "environment",
    credentials: "environment",
  });
  const file = NodePath.join(h.directory, "override.json");
  await NodeFSP.writeFile(file, JSON.stringify({ accessToken: "file-token" }));
  status = await h.invoke(["auth", "status", "--server", h.server.httpUrl, "--credentials", file]);
  expect(status.result.data.effective.sources).toEqual({ server: "flag", credentials: "file" });
  expect(
    h.server.routes.requests.findLast((r) => r.path === "/api/auth/session")?.headers[
      "authorization"
    ],
  ).toBe("Bearer file-token");
  expect(await NodeFSP.readFile(NodePath.join(h.directory, "config.json"), "utf8")).toBe(before);
  vi.stubEnv("T3_SERVER_URL", "");
  vi.stubEnv("T3_TOKEN", "");
  expect((await h.invoke(["auth", "status"])).result.data.effective.sources).toEqual({
    server: "profile",
    credentials: "profile",
  });
});
it.each(["", " \t "])(
  "auth uses XDG then home when config environment is blank %j",
  async (blank) => {
    vi.stubEnv("T3C_CONFIG_HOME", blank);
    vi.stubEnv("XDG_CONFIG_HOME", h.directory);
    expect(
      (
        await h.invoke([
          "auth",
          "pair",
          `${h.server.httpUrl}/pair#token=sample`,
          "--name",
          "sample",
        ])
      ).code,
    ).toBe(0);
    const config = NodePath.join(h.directory, "t3c", "config.json");
    expect((await NodeFSP.stat(config)).mode & 0o777).toBe(0o644);
    expect((await h.invoke(["auth", "status"])).result.data.current).toBe("sample");
    const home = NodePath.join(h.directory, "home");
    vi.stubEnv("HOME", home);
    vi.stubEnv("XDG_CONFIG_HOME", blank);
    expect(NodeOS.homedir()).toBe(home);
    expect(
      (
        await h.invoke([
          "auth",
          "pair",
          `${h.server.httpUrl}/pair#token=sample`,
          "--name",
          "sample",
        ])
      ).code,
    ).toBe(0);
    expect((await NodeFSP.stat(NodePath.join(home, ".config/t3c/config.json"))).mode & 0o777).toBe(
      0o644,
    );
    expect((await h.invoke(["auth", "logout"])).code).toBe(0);
  },
);
