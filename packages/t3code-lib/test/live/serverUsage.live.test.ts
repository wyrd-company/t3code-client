// ---
// relationships:
//   verifies: library-facades
// ---
/**
 * Provider status and usage summaries against the isolated stock server.
 * Usage scans provider transcripts on this host, so only shapes and types
 * are asserted and nothing from the result is logged.
 */
import { WebSocket as WsWebSocket } from "ws";
import { describe, expect, it } from "vite-plus/test";
import { T3Client, T3RpcError, usageDay } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];
const webSocket = WsWebSocket as unknown as WebSocketConstructor;

describe.skipIf(!baseUrl || !token)("live provider status and usage", () => {
  it("reports provider records and filters one instance exactly", async () => {
    const client = T3Client.create({ baseUrl: baseUrl!, accessToken: token!, webSocket });
    try {
      const providers = await client.server.providerStatus();
      expect(providers.length).toBeGreaterThan(0);
      for (const provider of providers) {
        expect(typeof provider.installed).toBe("boolean");
        expect(typeof provider.enabled).toBe("boolean");
        expect(typeof provider.status).toBe("string");
        expect(provider.auth).toBeTypeOf("object");
      }
      const first = providers[0]!;
      const one = await client.server.providerStatus(first.instanceId);
      expect(one.map((provider) => provider.instanceId)).toEqual([first.instanceId]);
      await expect(client.server.providerStatus("absent-instance")).resolves.toEqual([]);
    } finally {
      await client.close();
    }
  });

  it("reads a usage summary and reports an invalid window as UsageReadError", async () => {
    const client = T3Client.create({ baseUrl: baseUrl!, accessToken: token!, webSocket });
    try {
      const today = usageDay(new Date().toISOString().slice(0, 10));
      const summary = await client.server.usageSummary({
        sinceDay: today,
        untilDay: today,
        timeZone: "Etc/UTC",
      });
      expect(summary).toMatchObject({ timeZone: "Etc/UTC", sinceDay: today, untilDay: today });
      expect(typeof summary.contractVersion).toBe("number");
      expect(Array.isArray(summary.buckets)).toBe(true);
      expect(Array.isArray(summary.sources)).toBe(true);
      expect(typeof summary.pricing.status).toBe("string");
      expect(summary.scanDurationMs).toBeGreaterThanOrEqual(0);
      for (const bucket of summary.buckets) {
        expect(typeof bucket.costSource).toBe("string");
        expect(bucket.totals.reasoningTokens).toBeLessThanOrEqual(bucket.totals.outputTokens);
      }

      const failure = await client.server
        .usageSummary({ sinceDay: today, untilDay: usageDay("2000-01-01"), timeZone: "Etc/UTC" })
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(T3RpcError);
      const rpcError = failure as T3RpcError;
      expect(rpcError.is("UsageReadError") && rpcError.record.reason).toBe("invalidWindow");
    } finally {
      await client.close();
    }
  });

  it("refuses a usage summary to a caller without diagnostics:read", async () => {
    const operator = T3Client.create({ baseUrl: baseUrl!, accessToken: token!, webSocket });
    const reader = T3Client.create({ baseUrl: baseUrl!, webSocket });
    try {
      const pairing = await operator.auth.createPairingCredential({
        label: "sample-usage-reader",
        scopes: ["orchestration:read"],
      });
      await reader.auth.exchangePairingToken(pairing.credential);
      const day = usageDay("2000-01-01");
      const window = { sinceDay: day, untilDay: day, timeZone: "Etc/UTC" };
      await expect(reader.server.usageSummary(window)).rejects.toMatchObject({
        code: "insufficient_scope",
        requiredScope: "diagnostics:read",
      });
      const failure = await reader.rpc
        .callRaw("server.getUsageSummary", window)
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({ tag: "EnvironmentAuthorizationError" });
    } finally {
      await reader.close();
      await operator.close();
    }
  });
});
