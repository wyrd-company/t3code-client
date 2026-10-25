// ---
// relationships:
//   verifies: library-testing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeEvents from "node:events";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import setup from "../live/globalSetup.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, mkdtemp: vi.fn(actual.mkdtemp), readFile: vi.fn(actual.readFile) };
});
vi.mock("node:child_process", () => ({ spawn: vi.fn(), execFileSync: vi.fn() }));
vi.mock("../live/serverEvidence.ts", () => ({
  processIdentities: vi.fn(async () => [
    { pid: 23456, startIdentity: "synthetic-stat", executable: "/example/server" },
    { pid: 23457, absentDuringCapture: true },
  ]),
  processAbsent: vi.fn(() => true),
}));
const roots: string[] = [];
// Generic pairing URL encoded with the stock server QR encoder and terminal renderer.
const syntheticQr =
  "                                     \n  █▀▀▀▀▀█   ▀█▀██▄█ █▀▀█ ▀▄ █▀▀▀▀▀█  \n  █ ███ █ █ ▀ ▄▀▄▄▄▄ ▄▀▀█ █ █ ███ █  \n  █ ▀▀▀ █ █  ▀█ ▄█▄▀█▀▀▄▄▀▄ █ ▀▀▀ █  \n  ▀▀▀▀▀▀▀ █ █ █ ▀▄▀ ▀▄█▄▀ █ ▀▀▀▀▀▀▀  \n  █ ████▀   ▄▄ ▀▀▀ █▄▄▄ ▀▄  ██▀██ ▄  \n  █▄█▀▀▄▀█ ▄▀▄  ▄▀  ▄ ▀█▄  █▀ █▄██   \n   ▄█   ▀▀▄▄▄██ ▄█▄▀ ▄█▄██ █▄▀▀█ █▄  \n  ▀▄ ▀▄▄▀█▄█▀  █▄ ▄ ▄ ███  ██▄  ▄▀   \n  ▄█▀ ▄▀▀█ █  █ █ █▀██▄▄ █▀▀▄█▀█▄ █  \n  ██▀█ ▀▀█▄ ███▀██▀  ▄▄▄  ▄  ██▄██▄  \n  ▄█   ▀▀█▄▀ ██▄▀▄▀█▄▄  ▀▄█▀▄▀▀█  █  \n  █  ▀▄█▀ ▀ ▀▄█ ▀█▀▀ ▄█▄▀  █ █▄██▀   \n  ▀ ▀ ▀▀▀▀▄▀ ▀▄█ ▀▄▀ ▄█ ▀ █▀▀▀█ ▄ █  \n  █▀▀▀▀▀█ ▄▀████▀█▀  ▄▄█▄██ ▀ █▄██▄  \n  █ ███ █ █▄█  ▀▄█▄ ██▄ ▀ ██▀▀██▄██  \n  █ ▀▀▀ █ ▀▀▄ ▄▀  ▄ █▄▄█▄  ██▀▄██    \n  ▀▀▀▀▀▀▀ ▀  ▀ ▀▀  ▀ ▀  ▀▀▀  ▀ ▀ ▀   \n                                     ";
const syntheticOutput =
  "Token: example-pairing-value\nPairing URL: https://example.invalid/pair#token=example-pairing-value\n" +
  syntheticQr +
  "\nUnkeyed example-private-value\n";

afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) await NodeFSP.rm(root, { recursive: true, force: true });
});

it.each([false, true])(
  "withholds successful server output and preserves lifecycle evidence (keep=%s)",
  async (keep) => {
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const evidence = await actual.mkdtemp(NodePath.join(NodeOS.tmpdir(), "sample-evidence-"));
    roots.push(evidence);
    vi.mocked(NodeFSP.mkdtemp).mockImplementation(async (prefix) => {
      const root = await actual.mkdtemp(prefix);
      roots.push(root);
      return root;
    });
    vi.stubEnv("T3_LIVE_URL", "");
    vi.stubEnv("T3_LIVE_TOKEN", "");
    vi.stubEnv("T3_LIVE_KEEP", keep ? "1" : "");
    vi.stubEnv("T3_LIVE_EVIDENCE_DIR", evidence);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(async () =>
          Response.json({ serverVersion: "0.1.2", orchestrationProtocolVersion: 2 }),
        ),
    );
    const server = Object.assign(new NodeEvents.EventEmitter(), {
      pid: 23456,
      exitCode: null,
      signalCode: null as NodeJS.Signals | null,
      kill: vi.fn(() => {
        server.signalCode = "SIGTERM";
        server.emit("exit");
        return true;
      }),
    });
    vi.mocked(NodeChildProcess.spawn).mockImplementation((_command, _args, options) => {
      NodeFS.writeSync((options?.stdio as [string, number, number])[1], syntheticOutput);
      return server as unknown as NodeChildProcess.ChildProcess;
    });
    vi.mocked(NodeChildProcess.execFileSync).mockReturnValue("example-session-value");
    vi.mocked(NodeFSP.readFile).mockImplementation(async (path) => {
      if (String(path).startsWith("/proc/")) return "synthetic-stat";
      return syntheticOutput;
    });
    const teardown = await setup();
    expect(teardown).toBeTypeOf("function");
    await teardown!();
    const root = roots.at(-1)!;
    const prefix = NodePath.join(evidence, NodePath.basename(root));
    const retained = await actual.readFile(`${prefix}-server.log`, "utf8");
    for (const value of [
      "example-pairing-value",
      "example-session-value",
      "example-private-value",
      "█",
      "▀",
      "▄",
    ])
      expect(retained).not.toContain(value);
    expect(retained).toContain("withheld");
    expect(vi.mocked(NodeFSP.readFile).mock.calls.map(([path]) => String(path))).toEqual([
      "/proc/23456/stat",
    ]);
    const ready = JSON.parse(await actual.readFile(`${prefix}-ready.json`, "utf8"));
    const stopped = JSON.parse(await actual.readFile(`${prefix}-stopped.json`, "utf8"));
    const cleanup = JSON.parse(await actual.readFile(`${prefix}-cleanup.json`, "utf8"));
    expect(ready).toMatchObject({ serverVersion: "0.1.2", protocol: 2 });
    expect(stopped).toMatchObject({
      signalCode: "SIGTERM",
      pidAbsent: true,
      ownedProcesses: ready.ownedProcesses.map((identity: object) => ({
        ...identity,
        absent: true,
      })),
    });
    expect(stopped.ownedProcesses).toHaveLength(2);
    expect(cleanup).toMatchObject({ rootAbsent: !keep, kept: keep });
    expect(
      await actual.stat(root).then(
        () => true,
        () => false,
      ),
    ).toBe(keep);
    expect(server.kill).toHaveBeenCalledExactlyOnceWith("SIGTERM");
    if (keep)
      expect(await actual.readFile(NodePath.join(root, "server.log"), "utf8")).toBe(
        syntheticOutput,
      );
  },
);
