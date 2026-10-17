// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { authHarness, auth, expiry } from "../test/support/authHarness.ts";
import { T3NotFoundError } from "@wyrd-company/t3code-lib";
import { authHandlers } from "./auth.ts";
import { createInvocation } from "./context.ts";
import { Output } from "./output.ts";

let h: Awaited<ReturnType<typeof authHarness>>;
beforeEach(async () => {
  h = await authHarness();
});
afterEach(async () => {
  await h.close();
  vi.restoreAllMocks();
});

it("pairs both link forms and split token, stores separate 0600 files and preserves current", async () => {
  for (const [name, args] of [
    ["first", [`${h.server.httpUrl}/pair#token=sample`]],
    ["second", [`${h.server.httpUrl}/?token=sample`]],
    ["third", ["--server", h.server.httpUrl, "--pairing-token", "sample"]],
  ] as const) {
    expect((await h.invoke(["auth", "pair", ...args, "--name", name])).code).toBe(0);
  }
  expect(await h.profiles.getCurrent()).toMatchObject({ name: "first" });
  expect(await h.profiles.list()).toHaveLength(3);
  const config = await NodeFSP.readFile(NodePath.join(h.directory, "config.json"), "utf8");
  expect(config).not.toContain("token");
  for (const file of await NodeFSP.readdir(NodePath.join(h.directory, "credentials"))) {
    expect((await NodeFSP.stat(NodePath.join(h.directory, "credentials", file))).mode & 0o777).toBe(
      0o600,
    );
  }
});
it("switches and removes named/current profiles without selecting a replacement", async () => {
  await h.register();
  await h.register("second", "second-token");
  expect((await h.invoke(["auth", "switch", "second"])).code).toBe(0);
  expect(await h.profiles.getCurrent()).toMatchObject({ name: "second" });
  expect((await h.invoke(["auth", "logout"])).code).toBe(0);
  expect(await h.profiles.getCurrent()).toBeUndefined();
  expect(await h.profiles.list()).toEqual([{ name: "first", url: h.server.httpUrl }]);
  expect((await h.invoke(["auth", "logout", "first"])).code).toBe(0);
  expect(await h.profiles.list()).toEqual([]);
});
it("distinguishes unknown switch/logout preconditions from exact lookup not_found", async () => {
  for (const command of ["switch", "logout"])
    expect((await h.invoke(["auth", command, "missing"])).code).toBe(2);
  await expect(h.profiles.resolveProfile("missing")).rejects.toBeInstanceOf(T3NotFoundError);
  vi.spyOn(h.profiles, "resolveProfile").mockRejectedValue(
    new T3NotFoundError("sample", {
      status: 404,
      method: "LOCAL",
      path: "profile",
      body: undefined,
    }),
  );
  await h.register();
  let result: unknown;
  const invocation = createInvocation(
    {},
    new Output(
      {
        stdout: (s) => {
          result = JSON.parse(s);
        },
        stderr: () => {},
      },
      true,
    ),
    h.profiles,
  );
  try {
    await authHandlers["auth status"]!([], {} as never, invocation);
  } finally {
    await invocation.close();
  }
  expect(result).toMatchObject({
    exitCode: 10,
    data: { profiles: [{ error: { code: "not_found" } }] },
  });
});
it("probes exact names with duplicate URLs, own credentials and current marker despite overrides", async () => {
  await h.register();
  await h.register("second", "second-token");
  vi.stubEnv("T3_TOKEN", "override-token");
  const { code, result, stdout } = await h.invoke(["auth", "status"]);
  expect(code).toBe(0);
  expect(result.data.profiles).toMatchObject([
    { name: "first", current: true, scopes: ["orchestration:read"], authenticated: true },
    { name: "second", current: false, scopes: ["orchestration:operate"], authenticated: true },
  ]);
  expect(result.data.effective.sources).toEqual({ server: "profile", credentials: "environment" });
  const tokens = h.server.routes.requests
    .filter((r) => r.path === "/api/auth/session")
    .slice(-3)
    .map((r) => r.headers["authorization"]);
  expect(tokens).toEqual(["Bearer first-token", "Bearer second-token", "Bearer override-token"]);
  expect(stdout).not.toContain("override-token");
  expect(stdout).not.toContain("first-token");
  expect(result.data.profiles[0]).toMatchObject({
    label: "Sample server",
    expiresAt: expiry,
    reachable: true,
  });
});
it("reports all profiles after credential failure and exits on current or effective selection", async () => {
  await h.register();
  await h.register("second", "second-token");
  h.server.routes.route("GET /api/auth/session", (r) => ({
    status: 200,
    body: {
      auth,
      authenticated: r.headers["authorization"] !== "Bearer first-token",
    },
  }));
  let status = await h.invoke(["auth", "status"]);
  expect(status.code).toBe(9);
  expect(status.result.data.profiles).toMatchObject([
    { authenticated: false, error: { code: "auth_invalid" } },
    { authenticated: true },
  ]);
  vi.stubEnv("T3_TOKEN", "override-token");
  status = await h.invoke(["auth", "status"]);
  expect(status.code).toBe(0);
  expect(status.result.data.profiles[0].error.code).toBe("auth_invalid");
  vi.stubEnv("T3_TOKEN", "first-token");
  expect((await h.invoke(["auth", "status"])).code).toBe(9);
});
it("distinguishes expiry, unavailable server and storage failures without token leakage", async () => {
  await h.register();
  h.server.routes.route("GET /api/auth/session", () => ({
    status: 200,
    body: {
      auth,
      authenticated: true,
      expiresAt: "2000-01-01T00:00:00.000Z",
    },
  }));
  const expired = await h.invoke(["auth", "status"]);
  expect(expired.code).toBe(9);
  expect(expired.result.data.profiles[0].error.code).toBe("expired");
  const offline = await h.invoke(["auth", "status", "--server", "http://127.0.0.1:1"]);
  expect(offline.code).toBe(8);
  expect(offline.result.data.effective.reachable).toBe(false);
  await NodeFSP.rm(NodePath.join(h.directory, "credentials"), { recursive: true });
  await NodeFSP.writeFile(NodePath.join(h.directory, "credentials"), "blocked");
  const storage = await h.invoke([
    "auth",
    "pair",
    "--server",
    h.server.httpUrl,
    "--pairing-token",
    "sample-secret",
  ]);
  expect(storage.code).toBe(1);
  expect(storage.result.error.code).toBe("storage");
  expect(storage.stdout + storage.stderr).not.toContain("sample-secret");
});
it("rejects invalid input before exchange and never registers rejected credentials", async () => {
  const bad = await h.invoke(["auth", "pair", "--pairing-token", "sample-secret"]);
  expect(bad.code).toBe(2);
  expect(h.server.routes.requests).toHaveLength(0);
  h.server.routes.route("POST /oauth/token", () => ({
    status: 401,
    body: { error: "invalid_token" },
  }));
  const rejected = await h.invoke(["auth", "pair", `${h.server.httpUrl}/pair#token=sample-secret`]);
  expect(rejected.code).toBe(9);
  expect(await h.profiles.list()).toEqual([]);
  expect(rejected.stdout + rejected.stderr).not.toContain("sample-secret");
});
it("reports an empty config successfully and propagates current storage failure", async () => {
  expect((await h.invoke(["auth", "status"])).result).toEqual({
    data: { profiles: [], current: null, effective: null },
    exitCode: 0,
  });
  await h.register();
  const files = await NodeFSP.readdir(NodePath.join(h.directory, "credentials"));
  await NodeFSP.rm(NodePath.join(h.directory, "credentials", files[0]!));
  await NodeFSP.mkdir(NodePath.join(h.directory, "credentials", files[0]!));
  const status = await h.invoke(["auth", "status"]);
  expect(status.code).toBe(1);
  expect(status.result.data.profiles[0].error.code).toBe("storage");
  expect(status.result.data.profiles[0].reachable).toBe(true);
});

it("retains saved probe results when effective resolution fails", async () => {
  await h.register();
  let result: unknown;
  vi.spyOn(h.profiles, "resolve").mockRejectedValue(new Error("sample-secret"));
  const invocation = createInvocation(
    { server: h.server.httpUrl },
    new Output(
      {
        stdout: (s) => {
          result = JSON.parse(s);
        },
        stderr: () => {},
      },
      true,
    ),
    h.profiles,
  );
  try {
    await authHandlers["auth status"]!([], {} as never, invocation);
  } finally {
    await invocation.close();
  }
  expect(result).toMatchObject({
    exitCode: 1,
    data: { profiles: [{ authenticated: true }], effective: { error: { code: "unexpected" } } },
  });
  expect(JSON.stringify(result)).not.toContain("sample-secret");
});
it("formats status as a table and names effective sources in text mode", async () => {
  await h.register();
  let stdout = "";
  const invocation = createInvocation(
    {},
    new Output({
      stdout: (s) => {
        stdout += s;
      },
      stderr: () => {},
    }),
    h.profiles,
  );
  try {
    await authHandlers["auth status"]!([], {} as never, invocation);
  } finally {
    await invocation.close();
  }
  expect(stdout).toContain("CURRENT\tNAME\tURL");
  expect(stdout).toContain(`*\tfirst\t${h.server.httpUrl}\tSample server`);
  expect(stdout).toContain("server: profile, credentials: profile");
});
