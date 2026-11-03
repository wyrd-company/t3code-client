// ---
// relationships:
//   verifies: testing
// ---
/** The clients, skip conditions, model, stream reads and waits that the live tests of the isolated server share. */
import { WebSocket as WsWebSocket } from "ws";
import { T3Client, T3RpcError } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import type { AuthCreatePairingCredentialInput } from "../../src/schemas/auth.ts";
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

/** A client of the server at `url` that holds only `scopes`, paired by `owner`. */
export async function connectWithScopes(
  owner: T3Client,
  scopes: NonNullable<AuthCreatePairingCredentialInput["scopes"]>,
  url = baseUrl ?? "",
): Promise<T3Client> {
  const { credential } = await owner.auth.createPairingCredential({
    label: "sample-scoped",
    scopes,
  });
  const scoped = T3Client.create({
    baseUrl: url,
    webSocket: WsWebSocket as unknown as WebSocketConstructor,
  });
  await scoped.auth.exchangePairingToken(credential);
  return scoped;
}

/** The record of a typed refusal. Any other outcome fails the test. */
export const refusal = async (promise: Promise<unknown>) => {
  const outcome = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (!(outcome instanceof T3RpcError)) throw new Error("Expected a typed refusal.");
  return outcome.record;
};

/** The first item that `accept` keeps. A decode error fails the test. */
export async function firstItem<T, R>(
  items: AsyncIterable<
    | { readonly kind: "item"; readonly value: T }
    | { readonly kind: "decode-error"; readonly error: Error }
  >,
  accept: (value: T) => R | undefined,
): Promise<R> {
  for await (const item of items) {
    if (item.kind === "decode-error") throw item.error;
    const kept = accept(item.value);
    if (kept !== undefined) return kept;
  }
  throw new Error("The stream ended without the expected item.");
}

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

/** Wait until the thread's turn ends, in any way. */
export const turnEnded = (client: T3Client, id: string) =>
  waitFor(async () => {
    const row = (await client.shell.snapshot()).threads.find((entry) => entry.id === id);
    return row && ["completed", "idle", "failed", "interrupted"].includes(row.status)
      ? row
      : undefined;
  }, "the turn to end");
