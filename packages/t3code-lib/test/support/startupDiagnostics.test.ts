// ---
// relationships:
//   verifies: library-testing
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeEvents from "node:events";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodeUtil from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import setup from "../live/globalSetup.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, mkdtemp: vi.fn(actual.mkdtemp), readFile: vi.fn(actual.readFile) };
});
vi.mock("node:child_process", () => ({ spawn: vi.fn(), execFileSync: vi.fn() }));
const roots: string[] = [];
const syntheticOutput =
  "Pairing credential: example-pairing-value\nhttps://example.invalid/?token=example-token\n█ ▄ █ QR\n";
let server: NodeEvents.EventEmitter & {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: ReturnType<typeof vi.fn>;
};

beforeEach(async () => {
  vi.stubEnv("T3_LIVE_URL", "");
  vi.stubEnv("T3_LIVE_TOKEN", "");
  vi.stubEnv("T3_LIVE_EVIDENCE_DIR", "");
  server = Object.assign(new NodeEvents.EventEmitter(), {
    exitCode: 23 as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn(() => {
      server.signalCode = "SIGTERM";
      server.emit("exit");
      return true;
    }),
  });
  vi.mocked(NodeChildProcess.spawn).mockImplementation((_command, _args, options) => {
    const stdio = options?.stdio as [string, number, number];
    NodeFS.writeSync(stdio[1], syntheticOutput);
    return server as unknown as NodeChildProcess.ChildProcess;
  });
  const { mkdtemp } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(NodeFSP.mkdtemp).mockImplementation(async (prefix) => {
    const root = await mkdtemp(prefix);
    roots.push(root);
    return root;
  });
  vi.mocked(NodeFSP.readFile).mockRejectedValue(new Error("Log reads are forbidden"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) await NodeFSP.rm(root, { recursive: true, force: true });
});

it("reports an exited startup without reading or forwarding pairing/QR output", async () => {
  const error = await setup().catch((error: unknown) => error);
  expect(error).toBeInstanceOf(Error);
  expect(NodeUtil.inspect(error)).toContain(
    "during readiness; exit=23, signal=none, code=unavailable",
  );
  expect(NodeUtil.inspect(error)).toContain(`Owned home retained at ${NodeOS.tmpdir()}`);
  expect(NodeUtil.inspect(error)).not.toContain("example-pairing-value");
  expect(NodeUtil.inspect(error)).not.toContain("example-token");
  expect(NodeUtil.inspect(error)).not.toContain("█");
  expect(NodeFSP.readFile).not.toHaveBeenCalled();
  expect(server.kill).not.toHaveBeenCalled();
  expect(await NodeFSP.stat(roots[0]!)).toBeDefined();
});

it.each(["EACCES", "example-secret-code"])(
  "contains token-issuance dependency payloads and allowlists error code %s",
  async (code) => {
    server.exitCode = null;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    vi.mocked(NodeChildProcess.execFileSync).mockImplementation(() => {
      throw Object.assign(new Error(syntheticOutput), {
        code,
        stdout: syntheticOutput,
        stderr: syntheticOutput,
        cause: new Error(syntheticOutput),
      });
    });
    const error = await setup().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    const diagnostic = NodeUtil.inspect(error, { depth: null });
    expect(diagnostic).toContain("during token issuance; exit=none, signal=SIGTERM");
    expect(diagnostic).toContain(`code=${code === "EACCES" ? code : "unavailable"}`);
    for (const value of ["example-pairing-value", "example-token", "█", "example-secret-code"])
      expect(diagnostic).not.toContain(value);
    expect(NodeChildProcess.execFileSync).toHaveBeenCalledWith(
      process.execPath,
      expect.any(Array),
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
    );
    expect(NodeFSP.readFile).not.toHaveBeenCalled();
    expect(server.kill).toHaveBeenCalledExactlyOnceWith("SIGTERM");
    expect(await NodeFSP.stat(roots.at(-1)!)).toBeDefined();
  },
);
