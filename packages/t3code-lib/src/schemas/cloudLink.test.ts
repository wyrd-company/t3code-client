// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";

import {
  EnvironmentCloudLinkStateResult,
  EnvironmentConnectReachability,
  RelayEnvironmentConfigRequest,
  RelayLinkProofRequest,
} from "./cloudLink.ts";
import { EnvironmentHttpCloudError } from "./httpErrors.ts";
import { RelayClientInstallProgressEvent, RelayClientStatus } from "./relayClient.ts";
import { decodeRpcErrorRecord } from "./rpcErrors.ts";
import { ServerSelfUpdateInput, ServerSelfUpdateProgressEvent } from "./serverSelfUpdate.ts";

describe("T3 Connect schemas", () => {
  it("reads a reachable tunnel, with and without a count", () => {
    const reachable = {
      status: "reachable",
      checkedAt: "2026-01-01T00:00:00.000Z",
      readyConnections: null,
      protocol: null,
    };
    expect(EnvironmentConnectReachability.parse(reachable)).toEqual(reachable);
    expect(
      EnvironmentCloudLinkStateResult.parse({
        linked: true,
        cloudUserId: "sample-user",
        relayUrl: "https://relay.invalid",
        relayIssuer: null,
        publishAgentActivity: true,
        reachability: { ...reachable, readyConnections: 4, protocol: "quic" },
      }).reachability,
    ).toMatchObject({ readyConnections: 4 });
  });

  it("keeps a reachability status or a cause of a newer server", () => {
    expect(
      EnvironmentConnectReachability.parse({ status: "sample-new", checkedAt: "sample" }),
    ).toMatchObject({ unknown: true });
    expect(
      EnvironmentConnectReachability.parse({
        status: "unreachable",
        checkedAt: "sample",
        cause: "sample-new",
        reason: "sample",
        hint: null,
        fix: "sample",
      }),
    ).toMatchObject({ cause: "sample-new" });
  });

  it("refuses an input that the server cannot take", () => {
    const origin = { localHttpHost: "127.0.0.1", localHttpPort: 3000 };
    const endpoint = {
      httpBaseUrl: "https://sample.invalid",
      wsBaseUrl: "wss://sample.invalid",
      providerKind: "manual",
    };
    const request = { challenge: "sample", relayIssuer: "sample", endpoint, origin };
    expect(RelayLinkProofRequest.safeParse(request).success).toBe(true);
    expect(
      RelayLinkProofRequest.safeParse({
        ...request,
        origin: { ...origin, localHttpPort: 70_000 },
      }).success,
    ).toBe(false);
    expect(
      RelayLinkProofRequest.safeParse({
        ...request,
        endpoint: { ...endpoint, providerKind: "sample-new" },
      }).success,
    ).toBe(false);
    expect(
      RelayEnvironmentConfigRequest.safeParse({
        relayUrl: "https://relay.invalid",
        cloudUserId: "sample",
        environmentCredential: "sample",
        cloudMintPublicKey: "sample",
      }).success,
    ).toBe(false);
  });

  it("reads each failure of the routes", () => {
    for (const _tag of [
      "EnvironmentHttpBadRequestError",
      "EnvironmentHttpUnauthorizedError",
      "EnvironmentHttpForbiddenError",
      "EnvironmentHttpConflictError",
      "EnvironmentHttpInternalServerError",
    ]) {
      expect(EnvironmentHttpCloudError.parse({ _tag, message: "sample" })).toMatchObject({ _tag });
    }
    expect(
      EnvironmentHttpCloudError.parse({
        _tag: "EnvironmentCloudEndpointUnavailableError",
        message: "sample",
        endpointRuntimeStatus: { status: "disabled" },
      }),
    ).toMatchObject({ endpointRuntimeStatus: { status: "disabled" } });
  });
});

describe("tunnel client schemas", () => {
  it("reads each status, and keeps one of a newer server", () => {
    for (const status of [
      { status: "available", executablePath: "/sample", source: "managed", version: "1.0.0" },
      { status: "missing", version: "1.0.0" },
      { status: "unsupported", platform: "sample", arch: "sample", version: "1.0.0" },
    ]) {
      expect(RelayClientStatus.parse(status)).toEqual(status);
    }
    expect(RelayClientStatus.parse({ status: "sample-new" })).toMatchObject({ unknown: true });
  });

  it("reads progress and completion, and a stage of a newer server", () => {
    expect(
      RelayClientInstallProgressEvent.parse({ type: "progress", stage: "sample-new" }),
    ).toEqual({ type: "progress", stage: "sample-new" });
    expect(
      RelayClientInstallProgressEvent.parse({
        type: "complete",
        status: { status: "missing", version: "1.0.0" },
      }),
    ).toMatchObject({ type: "complete", status: { status: "missing" } });
  });

  it("reads an install failure", () => {
    expect(
      decodeRpcErrorRecord({
        _tag: "RelayClientInstallFailedError",
        reason: "invalid_checksum",
        message: "sample",
      }),
    ).toMatchObject({ _tag: "RelayClientInstallFailedError", reason: "invalid_checksum" });
  });
});

describe("server self update schemas", () => {
  it("reads each result that an update can end with", () => {
    for (const result of [
      { targetVersion: "1.0.0", method: "boot-service", updateId: "sample" },
      { targetVersion: "1.0.0", method: "desktop-app", desktopUpdateToken: "sample" },
      { targetVersion: "1.0.0", method: "respawn" },
    ]) {
      expect(ServerSelfUpdateProgressEvent.parse({ type: "complete", result })).toEqual({
        type: "complete",
        result,
      });
    }
    expect(ServerSelfUpdateProgressEvent.parse({ type: "progress", stage: "installing" })).toEqual({
      type: "progress",
      stage: "installing",
    });
  });

  it("refuses an input that the server cannot take", () => {
    const targetVersion = "1.0.0";
    expect(ServerSelfUpdateInput.safeParse({ targetVersion }).success).toBe(true);
    expect(ServerSelfUpdateInput.safeParse({ targetVersion: " " }).success).toBe(false);
    expect(ServerSelfUpdateInput.safeParse({ targetVersion, channel: "beta" }).success).toBe(false);
    expect(
      ServerSelfUpdateInput.safeParse({ targetVersion, targetDatabaseMigration: 1.5 }).success,
    ).toBe(false);
  });

  it("reads an update failure", () => {
    expect(decodeRpcErrorRecord({ _tag: "ServerSelfUpdateError", reason: "sample" })).toMatchObject(
      { _tag: "ServerSelfUpdateError", reason: "sample" },
    );
  });
});
