// ---
// relationships:
//   implements: library-wire
// ---
import { z } from "zod";

import { Project, ProjectMutation, ProjectSnapshot } from "../../schemas/projects.ts";
import { defineRoute } from "../spec.ts";

export const projectRoutes = {
  "projects.snapshot": defineRoute({
    method: "GET",
    path: "/api/projects",
    auth: "required",
    scope: "orchestration:read",
    input: z.undefined(),
    success: ProjectSnapshot,
  }),
  "projects.mutate": defineRoute({
    method: "POST",
    path: "/api/projects/mutate",
    auth: "required",
    scope: "orchestration:operate",
    input: z.strictObject({ body: ProjectMutation }),
    success: Project,
    // Project scripts run on the host, so carrying them needs the grant that saves them.
    inputScopes: ({ body }) =>
      body.type !== "project.delete" && body.scripts !== undefined ? ["settings:write"] : [],
  }),
};
