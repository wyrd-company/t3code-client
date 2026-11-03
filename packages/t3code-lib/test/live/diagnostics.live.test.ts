// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The diagnostics methods on an owned stock server. A cleanup and a signal act
 * only in that server's home and process tree, and an endpoint check reaches only
 * a local stub.
 */
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { T3AuthError, type T3Client } from "../../src/index.ts";
import { connectWithScopes, firstItem, hasLiveServer, waitFor } from "./liveClient.ts";
import { startLocalHttp } from "./localHttp.ts";
import { startPeerServer, type PeerServer } from "./peerServer.ts";

const statusStub = async (status: number) => {
  const received: string[] = [];
  const server = await startLocalHttp((request, response) => {
    received.push(`${request.method} ${request.url}`);
    request.resume();
    request.on("end", () => response.writeHead(status).end());
  });
  return { url: `${server.url}/v1/traces`, received, close: server.close };
};

describe.skipIf(!hasLiveServer)("diagnostics methods", () => {
  let peer: PeerServer;
  let client: T3Client;
  beforeAll(async () => {
    peer = await startPeerServer();
    client = peer.client;
  }, 120_000);
  afterAll(async () => {
    await peer?.stop();
  });

  it("reads trace diagnostics, and an empty trace file is a result", async () => {
    const traces = await client.rpc.call("server.getTraceDiagnostics", {});
    expect(traces.traceFilePath.length).toBeGreaterThan(0);
    expect(typeof traces.recordCount).toBe("number");
    expect(["None", "Some"]).toContain(traces.error._tag);
  });

  it("reads the host's resources", async () => {
    const host = await client.rpc.call("server.getHostResources", {});
    expect(host.cpuCount).toBeGreaterThan(0);
    expect(host.totalMemoryBytes).toBeGreaterThan(0);
  });

  it("reads each resource history and follows the telemetry", async () => {
    const window = { windowMs: 60_000, bucketMs: 10_000 };
    const history = await client.rpc.call("server.getProcessResourceHistory", window);
    expect(history).toMatchObject(window);
    const telemetry = await client.rpc.call("server.getResourceTelemetryHistory", window);
    expect(telemetry).toMatchObject(window);
    expect(typeof telemetry.health.native.status).toBe("string");

    const snapshot = await firstItem(
      client.rpc.stream("subscribeResourceTelemetry", {}),
      (value) => value,
    );
    expect(typeof snapshot.groups.allT3.processCount).toBe("number");
    expect(typeof snapshot.power.stale).toBe("boolean");
  });

  it("asks the monitor to retry and answers with a snapshot", async () => {
    const retried = await client.rpc.call("server.retryResourceTelemetry", {});
    expect(typeof retried.accepted).toBe("boolean");
    expect(typeof retried.snapshot.sampleIntervalMs).toBe("number");
  });

  it("reports each outcome of an endpoint check", async () => {
    const accepting = await statusStub(200);
    const rejecting = await statusStub(503);
    const closed = await statusStub(200);
    await closed.close();
    try {
      await expect(
        client.rpc.call("server.checkOtlpEndpoint", { signal: "traces", url: accepting.url }),
      ).resolves.toMatchObject({ _tag: "Accepted", latencyMs: expect.any(Number) });
      expect(accepting.received).toEqual(["POST /v1/traces"]);
      await expect(
        client.rpc.call("server.checkOtlpEndpoint", { signal: "logs", url: rejecting.url }),
      ).resolves.toEqual({ _tag: "Rejected", status: 503 });
      await expect(
        client.rpc.call("server.checkOtlpEndpoint", { signal: "metrics", url: closed.url }),
      ).resolves.toEqual({ _tag: "Unreachable", timedOut: false });
    } finally {
      await accepting.close();
      await rejecting.close();
    }
  });

  it("removes an old rotated log and reports it on the stream", async () => {
    const config = await client.server.getConfig();
    const logs = config.observability.logsDirectoryPath as string;
    await NodeFSP.mkdir(logs, { recursive: true });
    const rotated = NodePath.join(logs, "sample.log.1");
    const current = NodePath.join(logs, "sample.log");
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const writeOld = async (path: string) => {
      await NodeFSP.writeFile(path, "sample");
      await NodeFSP.utimes(path, old, old);
    };
    await writeOld(current);
    await client.rpc.call("server.updateSettings", {
      patch: { storageCleanup: { logsAfterDays: 1 } },
    });

    // The settings change starts its own sweep, which can take the file first, so write it again.
    const report = await waitFor(
      async () => {
        await writeOld(rotated);
        const run = await client.rpc.call("server.runStorageCleanup", {});
        const logEntry = run.entries.find((entry) => entry.kind === "logs");
        return logEntry?.outcome === "removed" ? run : undefined;
      },
      "a manual sweep that removes the file",
      { timeoutMs: 30_000, intervalMs: 100 },
    );
    expect(report.trigger).toBe("manual");
    expect(report.counts.failed).toBe(0);
    expect(report.entries.find((entry) => entry.kind === "logs")).toMatchObject({
      files: 1,
      bytes: 6,
    });
    expect(report.bytesFreed).toBeGreaterThanOrEqual(6);
    expect(NodeFS.existsSync(rotated)).toBe(false);
    expect(NodeFS.existsSync(current)).toBe(true);

    const streamed = await firstItem(
      client.rpc.stream("server.getStorageCleanupReport", {}),
      (r) => (r === null ? undefined : r),
    );
    expect(Date.parse(streamed.finishedAt)).toBeGreaterThanOrEqual(Date.parse(report.finishedAt));
  }, 60_000);

  it("refuses to signal the server, a stale identity, and stops a terminal", async () => {
    const before = await client.rpc.call("server.getProcessDiagnostics", {});
    const server = await client.rpc.call("server.signalProcess", {
      pid: before.serverPid,
      startTimeMs: 0,
      signal: "SIGINT",
    });
    expect(server).toMatchObject({ signaled: false, message: { _tag: "Some" } });

    const session = { threadId: NodeCrypto.randomUUID(), terminalId: "term-1" };
    const { cwd } = await client.server.getConfig();
    await client.rpc.call("terminal.open", { ...session, cwd });
    try {
      await client.rpc.call("terminal.write", { ...session, data: "sleep 31415\n" });
      const sleeping = await waitFor(
        async () => {
          const { processes } = await client.rpc.call("server.getProcessDiagnostics", {});
          return processes.find((entry) => entry.command.includes("sleep 31415"));
        },
        "the sleep in the terminal",
        { timeoutMs: 60_000 },
      );
      const stale = await client.rpc.call("server.signalProcess", {
        pid: sleeping.pid,
        startTimeMs: sleeping.startTimeMs + 1,
        signal: "SIGKILL",
      });
      expect(stale).toMatchObject({ signaled: false, message: { _tag: "Some" } });

      const signaled = await client.rpc.call("server.signalProcess", {
        pid: sleeping.pid,
        startTimeMs: sleeping.startTimeMs,
        signal: "SIGKILL",
      });
      expect(signaled).toEqual({
        pid: sleeping.pid,
        signal: "SIGKILL",
        signaled: true,
        message: { _tag: "None" },
      });
      await waitFor(
        async () => {
          const { processes } = await client.rpc.call("server.getProcessDiagnostics", {});
          return processes.some(
            (entry) => entry.pid === sleeping.pid && entry.startTimeMs === sleeping.startTimeMs,
          )
            ? undefined
            : true;
        },
        "the signaled process to leave the list",
        { timeoutMs: 60_000 },
      );
    } finally {
      await client.rpc.call("terminal.close", { ...session, deleteHistory: true });
    }
  }, 180_000);

  describe("scopes", () => {
    it("needs both scopes for a retry, and refuses locally what the server refuses", async () => {
      const reader = await connectWithScopes(
        client,
        ["orchestration:read", "diagnostics:read"],
        peer.baseUrl,
      );
      const maintainer = await connectWithScopes(client, ["environment:maintain"], peer.baseUrl);
      const both = await connectWithScopes(
        client,
        ["diagnostics:read", "environment:maintain"],
        peer.baseUrl,
      );
      try {
        for (const scoped of [reader, maintainer]) {
          await expect(scoped.rpc.call("server.retryResourceTelemetry", {})).rejects.toBeInstanceOf(
            T3AuthError,
          );
          expect(
            await scoped.rpc.callRaw("server.retryResourceTelemetry", {}).catch((e: unknown) => e),
          ).toMatchObject({ tag: "EnvironmentAuthorizationError" });
        }
        await expect(both.rpc.call("server.retryResourceTelemetry", {})).resolves.toBeDefined();

        const signal = { pid: 1, startTimeMs: 0, signal: "SIGINT" };
        await expect(
          reader.rpc.call("server.signalProcess", signal as never),
        ).rejects.toBeInstanceOf(T3AuthError);
        expect(
          await reader.rpc.callRaw("server.signalProcess", signal).catch((e: unknown) => e),
        ).toMatchObject({ tag: "EnvironmentAuthorizationError" });
        for (const [method, payload] of [
          ["server.checkOtlpEndpoint", { signal: "logs", url: "http://127.0.0.1:9/" }],
          ["server.runStorageCleanup", {}],
        ] as const) {
          await expect(reader.rpc.call(method, payload as never)).rejects.toBeInstanceOf(
            T3AuthError,
          );
          expect(await reader.rpc.callRaw(method, payload).catch((e: unknown) => e)).toMatchObject({
            tag: "EnvironmentAuthorizationError",
          });
        }
      } finally {
        await reader.close();
        await maintainer.close();
        await both.close();
      }
    }, 60_000);
  });
});
