// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";

// settings.ts: live accounting for the environment's state database file.

export const DatabaseStorageStatus = z.looseObject({
  databaseBytes: z.number(),
  /** Free pages an offline vacuum returns to disk. */
  reclaimableBytes: z.number(),
  /** False on databases created before incremental auto-vacuum. */
  incrementalVacuumEnabled: z.boolean(),
  /** Command to run on the host to reclaim the space offline. */
  compactCommand: z.string(),
});
export type DatabaseStorageStatus = z.infer<typeof DatabaseStorageStatus>;

/** One `server.getDatabaseStorage` item: `null` until the server first reads the file. */
export const DatabaseStorageStatusUpdate = DatabaseStorageStatus.nullable();
export type DatabaseStorageStatusUpdate = z.infer<typeof DatabaseStorageStatusUpdate>;
