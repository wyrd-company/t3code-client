/**
 * When a watch resubscribes after its stream fails. The transport reconnects
 * on its own after a drop; a watch only has to subscribe again. A message
 * too large for the socket is the exception once a fresh subscription has
 * delivered nothing: the server sends the same snapshot on every attempt.
 */
import { T3ConnectionError } from "../errors.ts";
import type { SocketState } from "../transport/socket.ts";

export function shouldResubscribe(error: unknown, state: SocketState, received: boolean): boolean {
  if (!(error instanceof T3ConnectionError) || state !== "connecting") return false;
  return received || error.reason !== "message_too_large";
}
