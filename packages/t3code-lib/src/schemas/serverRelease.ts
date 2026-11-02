// ---
// relationships:
//   implements: library
// ---
/**
 * The npm release lookup and the triage session start of `packages/contracts/src/server.ts`.
 */
import { z } from "zod";
import { AuthClientPresentationMetadata } from "./auth.ts";

export const ServerNpmReleaseInput = z.looseObject({
  spec: z
    .string()
    .max(64)
    .regex(/^(?:latest|nightly|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/),
});
export type ServerNpmReleaseInput = z.infer<typeof ServerNpmReleaseInput>;

export const ServerNpmRelease = z.looseObject({
  version: z.string(),
  databaseMigration: z.number().int().optional(),
});
export type ServerNpmRelease = z.infer<typeof ServerNpmRelease>;

/** The client tells the server what it is, so that the triage session can name it. */
export const ServerPrepareTriageInput = z.looseObject({
  client: AuthClientPresentationMetadata,
});
export type ServerPrepareTriageInput = z.infer<typeof ServerPrepareTriageInput>;

export const ServerPrepareTriageResult = z.looseObject({
  /** Composer text that links the session's prompt file. */
  prompt: z.string(),
});
export type ServerPrepareTriageResult = z.infer<typeof ServerPrepareTriageResult>;

/** The prompt file links as a chip in the user's message; clients spot a triage draft by it. */
export const TRIAGE_PROMPT_FILE_NAME = "triage-playbook.md";
