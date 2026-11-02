// ---
// relationships:
//   implements: library-wire
// ---
import { z } from "zod";

import { ThreadId, TrimmedNonEmptyString } from "../../schemas/common.ts";
import {
  ORCHESTRATION_PROTOCOL_HEADER,
  ORCHESTRATION_PROTOCOL_VERSION_TEXT,
} from "../../schemas/environment.ts";
import {
  OrchestrationV2ThreadBoundedSnapshot,
  OrchestrationV2ThreadDetailSnapshot,
  OrchestrationV2ThreadHistoryPage,
  OrchestrationV2ThreadTranscript,
} from "../../schemas/orchestration/projection.ts";
import { OrchestrationV2ShellSnapshot } from "../../schemas/orchestration/shell.ts";
import { defineRoute } from "../spec.ts";

const headers = { [ORCHESTRATION_PROTOCOL_HEADER]: ORCHESTRATION_PROTOCOL_VERSION_TEXT };

/** The server enables a query option only when its value is `"1"`. */
const Flag = z.literal("1").optional();

const ThreadParams = z.strictObject({ threadId: ThreadId });

const common = { method: "GET", auth: "required", scope: "orchestration:read", headers } as const;

export const orchestrationRoutes = {
  "orchestration.shellSnapshot": defineRoute({
    ...common,
    path: "/api/orchestration/shell",
    input: z
      .strictObject({
        query: z.strictObject({ omitIdleSubagents: Flag, omitOlderSettled: Flag }).optional(),
      })
      .optional(),
    success: OrchestrationV2ShellSnapshot,
  }),
  "orchestration.threadSnapshot": defineRoute({
    ...common,
    path: "/api/orchestration/threads/:threadId",
    input: z.strictObject({ params: ThreadParams }),
    success: OrchestrationV2ThreadDetailSnapshot,
  }),
  "orchestration.threadTranscript": defineRoute({
    ...common,
    path: "/api/orchestration/threads/:threadId/transcript",
    input: z.strictObject({ params: ThreadParams }),
    success: OrchestrationV2ThreadTranscript,
  }),
  /**
   * With `compactTurnItems`, restore the turn items with
   * `boundedSnapshotProjection`. The `compactIds` wire form is not offered: it
   * saves bytes for a browser and the snapshot schema decodes whole ids.
   */
  "orchestration.threadBoundedSnapshot": defineRoute({
    ...common,
    path: "/api/orchestration/threads/:threadId/bounded",
    input: z.strictObject({
      params: ThreadParams,
      query: z
        .strictObject({ deferWork: Flag, compactTurnItems: Flag, dedupeBodies: Flag })
        .optional(),
    }),
    success: OrchestrationV2ThreadBoundedSnapshot,
  }),
  "orchestration.threadHistoryPage": defineRoute({
    ...common,
    path: "/api/orchestration/threads/:threadId/history",
    input: z.strictObject({
      params: ThreadParams,
      query: z.strictObject({
        cursor: TrimmedNonEmptyString,
        throughEntryId: TrimmedNonEmptyString.optional(),
        view: z.enum(["conversation", "activity", "work"]).optional(),
        deferWork: Flag,
      }),
    }),
    success: OrchestrationV2ThreadHistoryPage,
  }),
};
