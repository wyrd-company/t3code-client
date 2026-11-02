// ---
// relationships:
//   verifies: testing
// ---
/** The client, skip conditions, model and waits that the live tests of the isolated server share. */
import { WebSocket as WsWebSocket } from "ws";
import { T3Client, T3RpcError } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { ProviderInstanceId } from "../../src/schemas/common.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];

export const hasLiveServer = Boolean(baseUrl && token);

/** `T3_LIVE_AGENT=1` allows the tests that run a real agent turn. */
export const hasAgent = process.env["T3_LIVE_AGENT"] === "1";

export const modelSelection = {
  instanceId: ProviderInstanceId.parse("codex"),
  model: "gpt-6-luna",
};

export const connectTo = (url: string, accessToken: string) =>
  T3Client.create({
    baseUrl: url,
    accessToken,
    webSocket: WsWebSocket as unknown as WebSocketConstructor,
  });

export const connect = () => connectTo(baseUrl ?? "", token ?? "");

/** The record of a typed refusal. Any other outcome fails the test. */
export const refusal = async (promise: Promise<unknown>) => {
  const outcome = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (!(outcome instanceof T3RpcError)) throw new Error("Expected a typed refusal.");
  return outcome.record;
};

/** Poll until `read` returns a value. A timeout fails the test. */
export async function waitFor<T>(
  read: () => Promise<T | undefined>,
  what: string,
  { timeoutMs = 240_000, intervalMs = 1_000 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await read();
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${what}.`);
}
