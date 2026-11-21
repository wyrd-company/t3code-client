// ---
// relationships:
//   verifies: request-watch
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { projectId, T3Client, T3ConnectionError } from "@wyrd-company/t3code-lib";
import { main } from "../main.ts";
import type { CommandSurface } from "../registration.ts";
import { requestsHandlers } from "./index.ts";

const surface = JSON.parse(
  await NodeFSP.readFile(
    new URL("../../../../docs/specifications/cli-surface.json", import.meta.url),
    "utf8",
  ),
) as CommandSurface;
const url = "https://server.example";
const secondUrl = "https://other.example";
const defaults = {
  projectIds: ["project-1"],
  kind: "approval",
  excludeThreadIds: ["worker"],
  excludeTags: ["reviewer"],
};
const at = "2026-01-01T00:00:00.000Z";
let directory: string;

beforeEach(async () => {
  directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-cli-watch-defaults-"));
  vi.stubEnv("T3C_CONFIG_HOME", directory);
  vi.stubEnv("T3_SERVER_URL", undefined);
  vi.stubEnv("T3_TOKEN", undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await NodeFSP.rm(directory, { recursive: true, force: true });
});

async function fixture(requestWatch?: unknown) {
  await NodeFSP.writeFile(
    NodePath.join(directory, "config.json"),
    JSON.stringify({
      servers: {
        sample: { url, requestWatch },
        secondary: { url: secondUrl, requestWatch: { kind: "user-input" } },
      },
      current: "sample",
    }),
  );
  const client = T3Client.create({ baseUrl: url });
  const create = vi.spyOn(T3Client, "create").mockReturnValue(client);
  const snapshot = vi.spyOn(client.projects, "snapshot").mockResolvedValue({
    projects: ["project-1", "project-2", "project-3"].map((id) => ({
      id: projectId(id),
      title: id,
      workspaceRoot: `/workspace/${id}`,
      defaultModelSelection: null,
      scripts: [],
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    })),
    updatedAt: at,
  });
  const watch = vi.spyOn(client.requests, "watch").mockImplementation(() => {
    throw new T3ConnectionError("closed", "Sample connection closed.");
  });
  async function run(flags: string[] = []) {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await main(
      ["requests", "watch", "--json", ...flags],
      surface,
      { stdout: (line) => stdout.push(line), stderr: (line) => stderr.push(line) },
      requestsHandlers,
    );
    return { code, stdout, stderr };
  }
  return { create, snapshot, watch, run };
}

it("passes profile filters to the watcher and ignores hook settings in config", async () => {
  const f = await fixture({ ...defaults, exec: "exit 23", execConcurrency: "bad" });
  const { code, stdout } = await f.run();
  expect(code).toBe(8);
  expect(f.watch).toHaveBeenCalledExactlyOnceWith({ ...defaults, signal: expect.any(AbortSignal) });
  expect(JSON.parse(stdout[0]!)).toMatchObject({ data: { hooks: null } });
});

it.each([
  [
    ["--project", "project-2", "--project", "project-3"],
    { projectIds: ["project-2", "project-3"] },
  ],
  [["--kind", "user-input"], { kind: "user-input" }],
  [
    ["--exclude-thread", "other", "--exclude-thread", "sample"],
    { excludeThreadIds: ["other", "sample"] },
  ],
  [["--exclude-tag", "other", "--exclude-tag", "sample"], { excludeTags: ["other", "sample"] }],
] as const)("replaces just the matching profile filter with %j", async (flags, override) => {
  const f = await fixture(defaults);
  expect((await f.run([...flags])).code).toBe(8);
  expect(f.watch).toHaveBeenCalledExactlyOnceWith({
    ...defaults,
    ...override,
    signal: expect.any(AbortSignal),
  });
});

it("watches without filters when the config uses the previous profile shape", async () => {
  const f = await fixture();
  expect((await f.run()).code).toBe(8);
  expect(f.watch).toHaveBeenCalledExactlyOnceWith({ signal: expect.any(AbortSignal) });
});

it("uses the profile matching the normalized server flag even with credential overrides", async () => {
  const f = await fixture(defaults);
  vi.stubEnv("T3_SERVER_URL", url);
  vi.stubEnv("T3_TOKEN", "sample-token");
  expect(
    (await f.run(["--server", "https://OTHER.example:443/path", "--credentials", "override.json"]))
      .code,
  ).toBe(8);
  expect(f.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ baseUrl: secondUrl }));
  expect(f.watch).toHaveBeenCalledExactlyOnceWith({
    kind: "user-input",
    signal: expect.any(AbortSignal),
  });
});

it("uses the profile matching T3_SERVER_URL and skips defaults for an unmatched server", async () => {
  const f = await fixture(defaults);
  vi.stubEnv("T3_SERVER_URL", "https://OTHER.example:443/path");
  expect((await f.run()).code).toBe(8);
  expect(f.watch).toHaveBeenCalledExactlyOnceWith({
    kind: "user-input",
    signal: expect.any(AbortSignal),
  });
  f.watch.mockClear();
  expect((await f.run(["--server", "https://unmatched.example"])).code).toBe(8);
  expect(f.watch).toHaveBeenCalledExactlyOnceWith({ signal: expect.any(AbortSignal) });
});

it("reports malformed defaults with the profile name before connecting", async () => {
  const f = await fixture({ kind: "sample-secret" });
  const { code, stdout, stderr } = await f.run(["--kind", "approval"]);
  const message = 'Invalid requestWatch defaults for profile "sample".';
  expect(code).toBe(2);
  expect(stderr).toEqual([`t3c: ${message}\n`]);
  expect(JSON.parse(stdout[0]!)).toMatchObject({
    type: "result",
    exitCode: 2,
    error: { code: "precondition", message },
  });
  expect(f.create).not.toHaveBeenCalled();
});

it("uses only flags with --ignore-defaults, even when the config defaults are malformed", async () => {
  const f = await fixture({ projectIds: ["project-1"], kind: null });
  expect((await f.run(["--ignore-defaults", "--exclude-tag", "sample"])).code).toBe(8);
  expect(f.watch).toHaveBeenCalledExactlyOnceWith({
    excludeTags: ["sample"],
    signal: expect.any(AbortSignal),
  });
});

it("preflights a project supplied only by config", async () => {
  const f = await fixture({ projectIds: ["missing"] });
  const { code, stderr } = await f.run();
  expect(code).toBe(10);
  expect(stderr).toEqual(['t3c: Selected project "missing" not found.\n']);
  expect(f.snapshot).toHaveBeenCalledTimes(1);
  expect(f.watch).not.toHaveBeenCalled();
});
