// ---
// relationships:
//   verifies: library-transport
// ---
import { expect, it } from "vite-plus/test";

import { httpRoutes } from "./registry.ts";

/** Method, path, authentication and scope, read from upstream's `environmentHttp.ts` and handlers. */
const expected: Record<string, [string, string, string, string | undefined]> = {
  "assets.read": ["GET", "/api/assets/:token/:path", "none", undefined],
  "attachments.upload": ["POST", "/api/attachments/upload/:token", "none", undefined],
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
  "connect.linkProof": ["POST", "/api/connect/link-proof", "required", "relay:write"],
  "connect.relayConfig": ["POST", "/api/connect/relay-config", "required", "relay:write"],
  "connect.linkState": ["GET", "/api/connect/link-state", "required", "relay:read"],
  "connect.checkReachability": ["POST", "/api/connect/reachability", "required", "relay:read"],
  "connect.unlink": ["POST", "/api/connect/unlink", "required", "relay:write"],
  "connect.preferences": ["POST", "/api/connect/preferences", "required", "relay:write"],
  "connect.health": ["POST", "/api/t3-connect/health", "none", undefined],
  "connect.mintCredential": ["POST", "/api/t3-connect/mint-credential", "none", undefined],
  "guest.redeem": ["POST", "/api/guest/redeem", "none", undefined],
  "guest.session": ["GET", "/api/guest/session", "none", undefined],
  "guest.submit": ["POST", "/api/guest/messages", "none", undefined],
  "guest.stream": ["GET", "/api/guest/stream", "none", undefined],
  "guest.render": ["GET", "/api/guest/render", "none", undefined],
  "guest.item": ["GET", "/api/guest/item", "none", undefined],
  "guest.history": ["GET", "/api/guest/history", "none", undefined],
  "guest.commandOutput": ["GET", "/api/guest/command-output", "none", undefined],
  "guest.attachment": ["GET", "/api/guest/attachment", "none", undefined],
  "guest.media": ["GET", "/api/guest/media", "none", undefined],
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
  "previewStream.download": [
    "GET",
    "/api/preview-stream/download",
    "required",
    "orchestration:read",
  ],
  "previewStream.upload": ["POST", "/api/preview-stream/upload", "required", "preview:operate"],
  "projects.snapshot": ["GET", "/api/projects", "required", "orchestration:read"],
  "projects.mutate": ["POST", "/api/projects/mutate", "required", "orchestration:operate"],
  "pullRequests.diff": ["POST", "/api/pull-requests/diff", "required", "orchestration:read"],
  "webhooks.webhookPost": ["POST", "/api/hooks/:hookId/:token", "none", undefined],
  "webhooks.webhookPut": ["PUT", "/api/hooks/:hookId/:token", "none", undefined],
  "webhooks.webhookPatch": ["PATCH", "/api/hooks/:hookId/:token", "none", undefined],
  "webhooks.webhookGet": ["GET", "/api/hooks/:hookId/:token", "none", undefined],
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
