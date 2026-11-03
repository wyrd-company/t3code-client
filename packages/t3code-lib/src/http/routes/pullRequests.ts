// ---
// relationships:
//   implements: library-wire
// ---
import { z } from "zod";

import { PullRequestDiffInput } from "../../schemas/pullRequestInputs.ts";
import { PullRequestDiffResult } from "../../schemas/pullRequestDiff.ts";
import { defineRoute } from "../spec.ts";

export const pullRequestRoutes = {
  /** A route and not an RPC method, so that a large patch has HTTP compression and flow control. */
  "pullRequests.diff": defineRoute({
    method: "POST",
    path: "/api/pull-requests/diff",
    auth: "required",
    scope: "orchestration:read",
    input: z.strictObject({ body: PullRequestDiffInput }),
    success: PullRequestDiffResult,
  }),
};
