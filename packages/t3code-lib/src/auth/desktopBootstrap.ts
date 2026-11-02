// ---
// relationships:
//   implements: library-auth
// ---
/**
 * The credential that a desktop launcher presents to the server it started.
 * The launcher gives the server a secret at startup; the token derives from
 * that secret and rotates. A token exchange or a browser session accepts it.
 */
import * as NodeCrypto from "node:crypto";

export const DESKTOP_BOOTSTRAP_TOKEN_WINDOW_MS = 12 * 60 * 60 * 1_000;

/** The token of the current window. The server also accepts the windows on each side. */
export function currentDesktopBootstrapToken(secret: string, nowMs: number = Date.now()): string {
  const window = Math.floor(nowMs / DESKTOP_BOOTSTRAP_TOKEN_WINDOW_MS);
  return NodeCrypto.createHmac("sha256", secret)
    .update(`t3-desktop-bootstrap:${window}`)
    .digest("hex");
}
