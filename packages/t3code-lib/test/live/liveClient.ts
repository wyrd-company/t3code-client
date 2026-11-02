// ---
// relationships:
//   verifies: testing
// ---
/** The client, skip condition and model that the live tests of the isolated server share. */
import { WebSocket as WsWebSocket } from "ws";
import { T3Client } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { ProviderInstanceId } from "../../src/schemas/common.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];

export const hasLiveServer = Boolean(baseUrl && token);

export const modelSelection = {
  instanceId: ProviderInstanceId.parse("codex"),
  model: "gpt-6-luna",
};

export const connect = () =>
  T3Client.create({
    baseUrl: baseUrl ?? "",
    accessToken: token ?? "",
    webSocket: WsWebSocket as unknown as WebSocketConstructor,
  });
