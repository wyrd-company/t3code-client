// ---
// relationships:
//   implements: library-transport
// ---
/** The HTTP route table: every route with a schema, assembled from `routes/*.ts`. */
import { assetRoutes } from "./routes/assets.ts";
import { authRoutes } from "./routes/auth.ts";
import { cloudLinkRoutes } from "./routes/cloudLink.ts";
import { guestRoutes } from "./routes/guest.ts";
import { mcpOAuthRoutes } from "./routes/mcpOAuth.ts";
import { orchestrationRoutes } from "./routes/orchestration.ts";
import { previewRoutes } from "./routes/preview.ts";
import { projectRoutes } from "./routes/projects.ts";
import { pullRequestRoutes } from "./routes/pullRequests.ts";
import { webhookRoutes } from "./routes/webhooks.ts";

/** Every HTTP route of the target build that has an entry, by upstream group and endpoint name. */
export const httpRoutes = {
  ...assetRoutes,
  ...authRoutes,
  ...cloudLinkRoutes,
  ...guestRoutes,
  ...mcpOAuthRoutes,
  ...orchestrationRoutes,
  ...previewRoutes,
  ...projectRoutes,
  ...pullRequestRoutes,
  ...webhookRoutes,
};

export type HttpRoutes = typeof httpRoutes;
export type HttpRouteName = keyof HttpRoutes & string;
