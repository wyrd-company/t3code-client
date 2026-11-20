// ---
// relationships:
//   implements: library
// ---
/** The HTTP shell snapshot route's answers, `GET /api/orchestration/shell`. */
import { z } from "zod";
import { OrchestrationV2ShellSnapshot } from "./shell.ts";

/**
 * The HTTP shell snapshot. `projectIdentities` names the projects' repository identities; send it
 * back as `knownProjectIdentities` when subscribing from this snapshot's cursor.
 */
export const OrchestrationV2ShellHttpSnapshot = z.looseObject({
  ...OrchestrationV2ShellSnapshot.shape,
  projectIdentities: z.string().optional(),
});
export type OrchestrationV2ShellHttpSnapshot = z.infer<typeof OrchestrationV2ShellHttpSnapshot>;

/**
 * The answer to `resumeFrom` when the socket can replay from that cursor: keep the rows held and
 * subscribe from the cursor.
 */
export const OrchestrationV2ShellResumable = z.looseObject({ resumable: z.literal(true) });
export type OrchestrationV2ShellResumable = z.infer<typeof OrchestrationV2ShellResumable>;

/** A snapshot, or `resumable` when the server can replay from the cursor the client holds. */
export const OrchestrationV2ShellResumeAnswer = z.union([
  OrchestrationV2ShellResumable,
  OrchestrationV2ShellHttpSnapshot,
]);
export type OrchestrationV2ShellResumeAnswer = z.infer<typeof OrchestrationV2ShellResumeAnswer>;
