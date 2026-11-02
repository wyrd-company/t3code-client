// ---
// relationships:
//   verifies: library-transport
// ---
import { expect, it } from "vite-plus/test";

import { httpRoutes } from "./registry.ts";

/** Method, path, authentication and scope, read from upstream's `environmentHttp.ts` and handlers. */
const expected: Record<string, [string, string, string, string | undefined]> = {
  "metadata.descriptor": ["GET", "/.well-known/t3/environment", "none", undefined],
  "auth.session": ["GET", "/api/auth/session", "optional", undefined],
  "auth.browserSession": ["POST", "/api/auth/browser-session", "none", undefined],
  "auth.token": ["POST", "/oauth/token", "none", undefined],
  "auth.webSocketTicket": ["POST", "/api/auth/websocket-ticket", "required", undefined],
  "auth.webSocketTicketFor": ["POST", "/api/auth/websocket-ticket/:use", "required", undefined],
  "auth.pairingCredential": ["POST", "/api/auth/pairing-token", "required", "access:write"],
  "auth.revokePairingLink": ["POST", "/api/auth/pairing-links/revoke", "required", "access:write"],
  "auth.revokeClient": ["POST", "/api/auth/clients/revoke", "required", "access:write"],
  "auth.revokeOtherClients": [
    "POST",
    "/api/auth/clients/revoke-others",
    "required",
    "access:write",
  ],
  "orchestration.shellSnapshot": [
    "GET",
    "/api/orchestration/shell",
    "required",
    "orchestration:read",
  ],
  "orchestration.threadSnapshot": [
    "GET",
    "/api/orchestration/threads/:threadId",
    "required",
    "orchestration:read",
  ],
  "orchestration.threadTranscript": [
    "GET",
    "/api/orchestration/threads/:threadId/transcript",
    "required",
    "orchestration:read",
  ],
  "orchestration.threadBoundedSnapshot": [
    "GET",
    "/api/orchestration/threads/:threadId/bounded",
    "required",
    "orchestration:read",
  ],
  "orchestration.threadHistoryPage": [
    "GET",
    "/api/orchestration/threads/:threadId/history",
    "required",
    "orchestration:read",
  ],
  "projects.snapshot": ["GET", "/api/projects", "required", "orchestration:read"],
  "projects.mutate": ["POST", "/api/projects/mutate", "required", "orchestration:operate"],
};

it("has one entry for each route of the table, with the server's scope", () => {
  const actual = Object.fromEntries(
    Object.entries(httpRoutes).map(([name, route]) => [
      name,
      [route.method, route.path, route.auth, "scope" in route ? route.scope : undefined],
    ]),
  );
  expect(actual).toEqual(expected);
});
