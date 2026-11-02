// ---
// relationships:
//   implements: library-transport
// ---
/** The HTTP route table: every route with a schema, assembled from `routes/*.ts`. */
import { assetRoutes } from "./routes/assets.ts";
import { authRoutes } from "./routes/auth.ts";
import { orchestrationRoutes } from "./routes/orchestration.ts";
import { projectRoutes } from "./routes/projects.ts";

/** Every HTTP route of the target build that has an entry, by upstream group and endpoint name. */
export const httpRoutes = {
  ...assetRoutes,
  ...authRoutes,
  ...orchestrationRoutes,
  ...projectRoutes,
};

export type HttpRoutes = typeof httpRoutes;
export type HttpRouteName = keyof HttpRoutes & string;
