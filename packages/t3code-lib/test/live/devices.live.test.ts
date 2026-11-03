// ---
// relationships:
//   verifies: library
// ---
/**
 * Device methods against an isolated stock server. No simulator or emulator runs here:
 * a local gateway stands in for a Simlock pool, and a stub `ssh` for a remote host, so that
 * the test reaches no real account or machine. The server installs its own device CLI from
 * npm on first use, in its scratch home.
 */
import * as NodeFSP from "node:fs/promises";
import * as NodeHttp from "node:http";
import type { AddressInfo } from "node:net";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { threadId, type T3Client } from "../../src/index.ts";
import { firstItem, hasLiveServer, refusal, waitFor } from "./liveClient.ts";
import { pathWith, startScratchServer, withScopes, type PeerServer } from "./peerServer.ts";

const SAMPLE_THREAD = threadId("sample-thread");
const SAMPLE_TOKEN = "sample-agent-token";
const SAMPLE_HOST = "sample-pool";
const SAMPLE_MODEL = "Sample Phone";

const probeOutput = JSON.stringify({
  nodePath: "/usr/bin/node",
  platforms: [{ platform: "android", available: true }],
});

/** Answers the two read routes of a Simlock gateway, and refuses any other credential. */
function startGateway(): Promise<{ readonly url: string; close(): Promise<void> }> {
  const answers: Record<string, unknown> = {
    "/v1/identity": { name: "sample-agent", role: "agent" },
    "/v1/catalog": {
      platforms: [{ platform: "android", modelRuntimes: { [SAMPLE_MODEL]: ["android-35"] } }],
    },
  };
  const server = NodeHttp.createServer((request, response) => {
    const answer = answers[request.url ?? ""];
    const allowed = request.headers.authorization === `Bearer ${SAMPLE_TOKEN}`;
    response.writeHead(!allowed ? 401 : answer === undefined ? 404 : 200, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify(allowed && answer !== undefined ? answer : {}));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        close: () => new Promise((done) => server.close(() => done())),
      }),
    );
  });
}

describe.skipIf(!hasLiveServer)("devices", () => {
  let server: PeerServer;
  let client: T3Client;
  let gateway: Awaited<ReturnType<typeof startGateway>>;

  beforeAll(async () => {
    gateway = await startGateway();
    server = await startScratchServer("t3code-lib-device-", async (home) => {
      const bin = NodePath.join(home, "bin");
      await NodeFSP.mkdir(bin);
      await NodeFSP.writeFile(
        NodePath.join(bin, "ssh"),
        `#!/bin/sh\ncat >/dev/null\nprintf '%s\\n' '${probeOutput}'\n`,
        { mode: 0o755 },
      );
      return pathWith(bin);
    });
    client = server.client;
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
    await gateway?.close();
  });

  it("reads the state of a server whose device support is off", async () => {
    const state = await client.rpc.call("device.list", {});
    expect(state.hostStatus).toBe("disabled");
    expect(state.devices).toEqual([]);
    expect(state.hosts.map((host) => host.kind)).toEqual(["local"]);
    const inspected = await client.rpc.call("device.list", { inspectOnly: true });
    expect(inspected.hosts[0]?.tools?.agent.requiredVersion).toEqual(expect.any(String));
    const streamed = await firstItem(client.rpc.stream("subscribeDeviceState", {}), (item) => item);
    expect(streamed.hubBasePath).toBe(state.hubBasePath);

    const off = { _tag: "DeviceHostUnavailableError", hostId: "local" };
    const target = { deviceId: "sample-device" };
    expect(await refusal(client.rpc.call("device.detail", target))).toMatchObject(off);
    expect(
      await refusal(client.rpc.call("device.action", { ...target, type: "shake" })),
    ).toMatchObject(off);
    expect(
      await refusal(client.rpc.call("device.shutdown", { ...target, platform: "android" })),
    ).toMatchObject(off);
    expect(
      await refusal(
        client.rpc.call("device.open", {
          ...target,
          threadId: SAMPLE_THREAD,
          platform: "android",
        }),
      ),
    ).toMatchObject({ _tag: "DevicePlatformUnavailableError", platform: "android" });
    await client.rpc.call("device.close", { threadId: SAMPLE_THREAD });
  });

  it("checks a credential and a host", async () => {
    expect(await refusal(client.rpc.call("device.easAccount", {}))).toMatchObject({
      _tag: "DeviceEasAccountError",
    });
    expect(await refusal(client.rpc.call("device.simlockIdentity", {}))).toMatchObject({
      _tag: "DeviceSimlockIdentityError",
    });
    expect(
      await refusal(
        client.rpc.call("device.simlockIdentity", {
          gatewayUrl: gateway.url,
          agentToken: "sample-wrong-token",
        }),
      ),
    ).toMatchObject({ _tag: "DeviceSimlockIdentityError" });
    expect(
      await client.rpc.call("device.simlockIdentity", {
        gatewayUrl: gateway.url,
        agentToken: SAMPLE_TOKEN,
      }),
    ).toMatchObject({
      gatewayUrl: gateway.url,
      signedInAs: "sample-agent",
      tokenSource: "entered",
    });

    const tested = await client.rpc.call("device.testHost", {
      id: "sample-ssh",
      label: "Sample",
      target: "sample.invalid",
    });
    expect(tested).toMatchObject({ id: "sample-ssh", kind: "ssh", hubInstalled: false });
    expect(tested.platforms).toEqual([{ platform: "android", available: true }]);
    expect(tested.tools).toBeNull();
  });

  it("lists a pool, and reaches each failure of its device", async () => {
    await client.rpc.call("device.configure", { enabled: true, onboardingCompleted: true });
    await client.rpc.call("server.updateSettings", {
      patch: {
        simlockDeviceHostsEnabled: true,
        simlockDeviceHosts: [
          {
            kind: "simlock",
            id: SAMPLE_HOST,
            label: "Sample pool",
            gatewayUrl: gateway.url,
            agentToken: SAMPLE_TOKEN,
          },
        ],
      },
    });
    // The server takes a host from its settings after the write.
    const state = await waitFor(async () => {
      const listed = await client.rpc.call("device.list", {});
      return listed.devices.some((item) => item.hostId === SAMPLE_HOST) ? listed : undefined;
    }, "the pool");
    expect(state.onboardingCompleted).toBe(true);
    expect(state.hostStatus).toBe("idle");
    expect(state.hostStatuses[SAMPLE_HOST]?.status).toBe("ready");
    // The server sends this host in `simlockHosts`.
    expect(state.hosts.find((host) => host.id === SAMPLE_HOST)).toMatchObject({
      kind: "simlock",
      hubInstalled: true,
    });
    expect("simlockHosts" in state).toBe(false);
    const device = state.devices.find((item) => item.name === SAMPLE_MODEL);
    if (device === undefined) throw new Error("The pool listed no device.");
    expect(device).toMatchObject({ hostId: SAMPLE_HOST, platform: "android", booted: false });
    const target = { hostId: SAMPLE_HOST, deviceId: device.id };

    const retried = await client.rpc.call("device.list", { retryHostId: SAMPLE_HOST });
    expect(retried.devices).toContainEqual(device);
    const updated = await client.rpc.call("device.list", { updateTool: "agent" });
    expect(updated.hosts[0]?.agentDeviceInstalled).toBe(true);
    const detail = await client.rpc.call("device.detail", target);
    expect(detail).toMatchObject({ ...target, settings: {}, foregroundApp: null });
    expect(
      await refusal(
        client.rpc.call("device.action", { ...target, type: "setAppearance", value: "dark" }),
      ),
    ).toMatchObject({ _tag: "DeviceOperationError", reason: "command_failed", exitCode: 127 });
    // The stand-in gateway has no agent-device route, so no lease starts.
    expect(
      await refusal(
        client.rpc.call("device.open", { ...target, threadId: SAMPLE_THREAD, platform: "android" }),
      ),
    ).toMatchObject({ _tag: "DeviceBootError", ...target, reason: "launch_failed" });
    expect((await client.rpc.call("device.list", {})).sessions).toEqual([]);
    await client.rpc.call("device.close", { threadId: SAMPLE_THREAD, ...target });
    await client.rpc.call("device.shutdown", { ...target, platform: "android" });
    expect(
      await refusal(
        client.rpc.call("device.detail", { hostId: SAMPLE_HOST, deviceId: "sample-missing" }),
      ),
    ).toMatchObject({ _tag: "DeviceNotFoundError", hostId: SAMPLE_HOST });
    expect(
      await refusal(client.rpc.call("device.list", { retryHostId: "sample-unknown" })),
    ).toMatchObject({ _tag: "DeviceHostUnavailableError", hostId: "sample-unknown" });

    const off = await client.rpc.call("device.configure", { enabled: false });
    expect(off.hostStatus).toBe("disabled");
    expect(off.devices).toEqual([]);
  }, 180_000);

  it("keeps each call to its scope", async () => {
    await withScopes(server, ["orchestration:read"], async (reader) => {
      await reader.rpc.call("device.list", {});
      // The server takes `inspectOnly` first, unless a tool update is also asked for.
      await reader.rpc.call("device.list", { inspectOnly: true, retryHostId: SAMPLE_HOST });
      const operate = { requiredPermission: "orchestration:operate" };
      for (const payload of [
        { retryHostId: SAMPLE_HOST },
        { updateTool: "agent", inspectOnly: true },
      ]) {
        expect(await refusal(reader.rpc.callRaw("device.list", payload))).toMatchObject(operate);
      }
      const target = { deviceId: "sample-device", platform: "android" };
      const operated: Record<string, unknown> = {
        "device.open": { ...target, threadId: SAMPLE_THREAD },
        "device.close": { threadId: SAMPLE_THREAD },
        "device.shutdown": target,
        "device.action": { deviceId: target.deviceId, type: "shake" },
      };
      for (const [method, payload] of Object.entries(operated)) {
        expect(await refusal(reader.rpc.callRaw(method, payload)), method).toMatchObject(operate);
      }
      const settings: Record<string, unknown> = {
        "device.configure": {},
        "device.testHost": { id: "sample-ssh", label: "Sample", target: "sample.invalid" },
        "device.easAccount": {},
        "device.simlockIdentity": {},
      };
      for (const [method, payload] of Object.entries(settings)) {
        expect(await refusal(reader.rpc.callRaw(method, payload)), method).toMatchObject({
          requiredPermission: "settings:write",
        });
      }
    });
  });
});
