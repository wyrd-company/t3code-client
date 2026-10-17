// ---
// relationships:
//   verifies: command-line
// ---
import { expect, it, vi } from "vite-plus/test";
import { T3Client } from "@wyrd-company/t3code-lib";
import { createInvocation } from "./context.ts";
import { Output } from "./output.ts";
import { main } from "./main.ts";
import * as NodeFSP from "node:fs/promises";
import type { CommandSurface } from "./registration.ts";

it("passes the default and selected connection timeout and client version to the library", async () => {
  const spy = vi.spyOn(T3Client, "create");
  try {
    for (const [input, expected] of [
      [{}, 30000],
      [{ connectTimeout: "2s" }, 2000],
    ] as const) {
      const invocation = createInvocation(
        { server: "http://127.0.0.1:1", ...input },
        new Output({ stdout: () => {}, stderr: () => {} }),
        undefined,
        "1.2.3",
      );
      await invocation.client();
      expect(spy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          baseUrl: "http://127.0.0.1:1",
          openTimeoutMs: expected,
          clientAppVersion: "1.2.3",
        }),
      );
      await invocation.close();
    }
  } finally {
    spy.mockRestore();
  }
});
it("reports a clear minimum Node error before loading command behavior", async () => {
  const surface = JSON.parse(
    await NodeFSP.readFile(
      new URL("../../../specifications/assets/cli-surface.json", import.meta.url),
      "utf8",
    ),
  ) as CommandSurface;
  const original = Object.getOwnPropertyDescriptor(process.versions, "node")!;
  const stderr: string[] = [];
  try {
    Object.defineProperty(process.versions, "node", { ...original, value: "22.15.0" });
    expect(
      await main(["version"], surface, {
        stdout: () => {},
        stderr: (s) => {
          stderr.push(s);
        },
      }),
    ).toBe(2);
    expect(stderr.join("")).toBe("t3c: t3c requires Node >=22.16.\n");
  } finally {
    Object.defineProperty(process.versions, "node", original);
  }
});

it("checks Node at the executable boundary before importing runtime dependencies", async () => {
  const NodeChildProcess = await import("node:child_process");
  const executable = new URL("../dist/cli.js", import.meta.url).href;
  const result = NodeChildProcess.spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `Object.defineProperty(process.versions,"node",{value:"22.15.0"}); await import(${JSON.stringify(executable)});`,
    ],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe("t3c: requires Node >=22.16.\n");
});

it("keeps every credential backend operation in local error context", async () => {
  const { ProfileManager, T3ConnectionError } = await import("@wyrd-company/t3code-lib");
  const profiles = new ProfileManager();
  const fail = async () => {
    throw new T3ConnectionError("open_failed", "sample");
  };
  vi.spyOn(profiles, "resolve").mockResolvedValue({
    baseUrl: "http://127.0.0.1:1",
    sources: { server: "flag", credentials: "none" },
    credentials: { load: fail, save: fail, clear: fail },
  });
  const spy = vi.spyOn(T3Client, "create");
  const invocation = createInvocation(
    {},
    new Output({ stdout: () => {}, stderr: () => {} }),
    profiles,
  );
  try {
    await invocation.client();
    const credentials = spy.mock.lastCall![0].credentials!;
    for (const operation of [
      () => credentials.load(),
      () => credentials.save({}),
      () => credentials.clear(),
    ]) {
      invocation.errorContext = "connection";
      await expect(operation()).rejects.toMatchObject({ code: "connection" });
      expect(invocation.errorContext).toBe("local");
    }
  } finally {
    await invocation.close();
    spy.mockRestore();
  }
});

it.each(["", " \t "])(
  "rejects explicit blank global URL and credential-file inputs %j",
  async (blank) => {
    const surface = JSON.parse(
      await NodeFSP.readFile(
        new URL("../../../specifications/assets/cli-surface.json", import.meta.url),
        "utf8",
      ),
    ) as CommandSurface;
    for (const flag of ["--server", "--credentials"]) {
      const lines: string[] = [];
      expect(
        await main(["version", "--json", flag, blank], surface, {
          stdout: (s) => {
            lines.push(s);
          },
          stderr: () => {},
        }),
      ).toBe(2);
      expect(JSON.parse(lines.join("")).exitCode).toBe(2);
    }
  },
);
