// ---
// relationships:
//   implements: library-wire
// ---
/**
 * The URLs of the sockets that `T3Client` opens beside `/ws`: the preview viewer and live
 * transcription. Each carries a new ticket for the `media` use, and a DPoP proof for that
 * ticket when the session is proof-bound.
 */
import type { AuthClient } from "../auth/authClient.ts";
import { createDpopProof } from "../auth/dpop.ts";
import { ensureScopes } from "../auth/scopes.ts";
import { T3PreconditionError } from "../errors.ts";
import type { HttpRouteClient } from "../http/client.ts";
import type { HttpRoutes } from "../http/registry.ts";
import type { AuthEnvironmentScope } from "../schemas/auth.ts";
import type { PreviewViewerTarget } from "../schemas/previewViewer.ts";

/** The socket URL of `path` on the server at `baseUrl`. */
export function webSocketUrl(path: string, baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(path, baseUrl);
  } catch (cause) {
    throw new T3PreconditionError(`baseUrl is not a valid URL: ${baseUrl}`, { cause });
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}

/** The viewer socket of a tab, with the target as its query. */
export function previewViewerUrl(baseUrl: string, target: PreviewViewerTarget): URL {
  const url = webSocketUrl("/api/preview-stream/ws", baseUrl);
  for (const [name, value] of Object.entries(target)) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  return url;
}

/**
 * Checks the granted scopes for `required`, then sets a new `media` ticket on `url`. The
 * server checks the scopes again on the upgrade; this check fails before a ticket is spent.
 */
export async function withMediaTicket(
  auth: AuthClient,
  routes: HttpRouteClient<HttpRoutes>,
  url: URL,
  required: { readonly scope: AuthEnvironmentScope; readonly operation: string },
  signal?: AbortSignal,
): Promise<URL> {
  const granted = await auth.currentScopes();
  if (granted !== undefined) ensureScopes(granted, [required.scope], required.operation);
  const { ticket } = await routes.call(
    "auth.webSocketTicketFor",
    { params: { use: "media" } },
    signal,
  );
  url.searchParams.set("wsTicket", ticket);
  const key = await auth.currentDpopKey();
  if (key !== undefined) {
    url.searchParams.set("dpop", createDpopProof({ key, method: "GET", url, accessToken: ticket }));
  }
  return url;
}
