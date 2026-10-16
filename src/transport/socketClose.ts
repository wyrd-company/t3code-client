/**
 * Classifies a WebSocket close event: was it a credential rejection (do not
 * retry) or a drop (reconnect)? A drop names an oversized message, so that a
 * watch can stop resubscribing to it.
 */
import { T3ConnectionError } from "../errors.ts";
import type { WebSocketCloseInfo } from "../internal/websocket.ts";

/** A 4xx upgrade or close code 1008 means the credential is wrong: do not retry. */
export function closeError(
  info: WebSocketCloseInfo,
  wasOpen: boolean,
): { error: T3ConnectionError; fatal: boolean } {
  const status = info.upgradeStatus;
  const detail = `${info.code} ${info.reason}`.trim();
  const fatal = (status !== undefined && status >= 400 && status < 500) || info.code === 1008;
  if (fatal) {
    const text =
      status === undefined
        ? `refused the socket: ${detail}`
        : `rejected the upgrade: HTTP ${status}`;
    return { fatal, error: new T3ConnectionError("open_failed", `The server ${text}.`) };
  }
  if (info.messageTooLarge === true) {
    const error = new T3ConnectionError(
      "message_too_large",
      `A socket message was over the size limit (${detail}). On a built-in WebSocket that caps compressed messages, pass webSocket from the ws package.`,
    );
    return { fatal: false, error };
  }
  const reason = wasOpen ? "closed" : "open_failed";
  return { fatal, error: new T3ConnectionError(reason, `The socket ended (${reason}): ${detail}`) };
}
