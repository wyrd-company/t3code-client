// ---
// relationships:
//   verifies: library-auth
// ---
import * as NodeCrypto from "node:crypto";
import { expect, it } from "vite-plus/test";

import {
  DESKTOP_BOOTSTRAP_TOKEN_WINDOW_MS,
  currentDesktopBootstrapToken,
} from "./desktopBootstrap.ts";

it("derives one token for each rotation window", () => {
  const start = 40 * DESKTOP_BOOTSTRAP_TOKEN_WINDOW_MS;
  const token = currentDesktopBootstrapToken("sample-secret", start);
  expect(token).toBe(
    NodeCrypto.createHmac("sha256", "sample-secret")
      .update("t3-desktop-bootstrap:40")
      .digest("hex"),
  );
  expect(currentDesktopBootstrapToken("sample-secret", start + 1)).toBe(token);
  expect(
    currentDesktopBootstrapToken("sample-secret", start + DESKTOP_BOOTSTRAP_TOKEN_WINDOW_MS),
  ).not.toBe(token);
});
