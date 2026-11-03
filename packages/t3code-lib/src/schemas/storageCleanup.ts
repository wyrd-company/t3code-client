// ---
// relationships:
//   implements: library
// ---
/** Mirrors the storage cleanup report in `packages/contracts/src/settings.ts`. */
import { z } from "zod";
import { ThreadId, forwardCompatibleLiteral } from "./common.ts";

export const StorageCleanupReportEntry = z.looseObject({
  kind: forwardCompatibleLiteral(["worktree", "browser-artifacts", "logs"]),
  outcome: forwardCompatibleLiteral(["removed", "kept", "failed"]),
  reason: z.string(),
  path: z.string().nullable(),
  projectPath: z.string().nullable().default(null),
  threadId: ThreadId.nullable(),
  threadTitle: z.string().nullable(),
  bytes: z.number().nullable().default(null),
  files: z.number().nullable().default(null),
});
export type StorageCleanupReportEntry = z.infer<typeof StorageCleanupReportEntry>;

export const StorageCleanupReport = z.looseObject({
  trigger: forwardCompatibleLiteral(["automatic", "manual"]),
  startedAt: z.string(),
  finishedAt: z.string(),
  entries: z.array(StorageCleanupReportEntry),
  counts: z.looseObject({ removed: z.number(), kept: z.number(), failed: z.number() }),
  /** Entries past the report's limit. `counts` includes them. */
  omittedCount: z.number(),
  bytesFreed: z.number().default(0),
});
export type StorageCleanupReport = z.infer<typeof StorageCleanupReport>;

/** One `server.getStorageCleanupReport` item: `null` until the first cleanup runs. */
export const StorageCleanupReportUpdate = StorageCleanupReport.nullable();
export type StorageCleanupReportUpdate = z.infer<typeof StorageCleanupReportUpdate>;
