// ---
// relationships:
//   implements: library
// ---
/**
 * Where a thread came from when a linked environment started it. The server
 * sets both when it creates the thread; a client never sends them.
 */
import { z } from "zod";
import { AuthMcpClientGrantedAccess } from "../auth.ts";
import {
  EnvironmentId,
  NonNegativeInt,
  RunId,
  ThreadId,
  TrimmedNonEmptyString,
} from "../common.ts";

/** The MCP client session of the linked environment whose agent started this work here. */
export const OrchestrationV2LinkOrigin = z.looseObject({
  sessionId: TrimmedNonEmptyString,
  label: z.string(),
  /** Omitted when the origin was stamped before access was recorded. */
  access: AuthMcpClientGrantedAccess.optional(),
});
export type OrchestrationV2LinkOrigin = z.infer<typeof OrchestrationV2LinkOrigin>;

/** The thread in a linked environment that delegated this one. */
export const OrchestrationV2DelegatedFrom = z.looseObject({
  environmentId: EnvironmentId,
  threadId: ThreadId,
  title: z.string(),
});
export type OrchestrationV2DelegatedFrom = z.infer<typeof OrchestrationV2DelegatedFrom>;

/** The thread in a linked environment that does the work of a delegated task. */
export const OrchestrationV2RemoteTaskChild = z.looseObject({
  environmentId: EnvironmentId,
  threadId: ThreadId,
  label: z.string(),
  runId: RunId.optional(),
  stoppedThere: z.boolean().optional(),
  stopCount: NonNegativeInt.optional(),
});
export type OrchestrationV2RemoteTaskChild = z.infer<typeof OrchestrationV2RemoteTaskChild>;
