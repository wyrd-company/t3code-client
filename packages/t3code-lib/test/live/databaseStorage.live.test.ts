// ---
// relationships:
//   verifies: library-facades
// ---
import { WebSocket as WsWebSocket } from "ws";
import { describe, expect, it } from "vite-plus/test";
import { T3Client, type DecodedStreamItem } from "../../src/index.ts";
import type {
  DatabaseStorageStatus,
  DatabaseStorageStatusUpdate,
} from "../../src/schemas/server.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];
const METHOD = "server.getDatabaseStorage";

// Counts this method's Request and Interrupt frames; no payload values are kept.
const frames = { requests: 0, interrupts: 0, ids: new Set<string>() };
class CountingSocket extends WsWebSocket {
  override send(data: unknown, ...rest: unknown[]): void {
    try {
      const parsed: unknown = JSON.parse(String(data));
      for (const frame of Array.isArray(parsed) ? parsed : [parsed]) {
        const record = frame as Record<string, unknown>;
        if (record["_tag"] === "Request" && record["tag"] === METHOD) {
          frames.requests += 1;
          frames.ids.add(String(record["id"]));
        }
        if (record["_tag"] === "Interrupt" && frames.ids.has(String(record["requestId"]))) {
          frames.interrupts += 1;
        }
      }
    } catch {
      // Non-JSON frames are not requests.
    }
    (super.send as (...args: unknown[]) => void)(data, ...rest);
  }
}

const isDecodeError = (
  item: DecodedStreamItem<DatabaseStorageStatus>,
): item is Extract<DecodedStreamItem<DatabaseStorageStatus>, { kind: "decode-error" }> =>
  "kind" in item && item.kind === "decode-error" && "error" in item;

// The first non-null status; a decode error fails the test. Returning from the loop ends the
// subscription. The command holds a host path, so only field types are asserted.
async function firstStatus(
  items: AsyncIterable<DecodedStreamItem<DatabaseStorageStatusUpdate>>,
): Promise<DatabaseStorageStatus> {
  for await (const item of items) {
    if (item === null) continue;
    if (isDecodeError(item)) throw item.error;
    return item;
  }
  throw new Error("The database storage stream ended without a status.");
}

describe.skipIf(!baseUrl || !token)("live database storage", () => {
  it("streams the database status on both typed paths and ends on early return", async () => {
    const client = T3Client.create({
      baseUrl: baseUrl!,
      accessToken: token!,
      webSocket: CountingSocket as unknown as WebSocketConstructor,
    });
    try {
      const environment = await client.server.environment();
      expect(environment.capabilities.databaseStorage).toBe(true);
      const facade = await firstStatus(client.server.watchDatabaseStorage());
      const typed = await firstStatus(
        (async function* () {
          for await (const item of client.rpc.stream(METHOD, {})) {
            yield item.kind === "item" ? item.value : item;
          }
        })(),
      );
      for (const status of [facade, typed]) {
        expect(Object.keys(status).sort()).toEqual([
          "compactCommand",
          "databaseBytes",
          "incrementalVacuumEnabled",
          "reclaimableBytes",
        ]);
        expect(typeof status.databaseBytes).toBe("number");
        expect(typeof status.reclaimableBytes).toBe("number");
        expect(typeof status.incrementalVacuumEnabled).toBe("boolean");
        expect(typeof status.compactCommand).toBe("string");
        expect(status.reclaimableBytes <= status.databaseBytes).toBe(true);
      }
      await expect.poll(() => frames.interrupts).toBe(2);
      expect(frames.requests).toBe(2);
    } finally {
      await client.close();
    }
  });
});
