// ---
// relationships:
//   implements: library
// ---
/**
 * The sessions of other agents on the server's host, which become projects and
 * threads. Mirrors `packages/contracts/src/agentSessions.ts`. A result stays open,
 * so a newer server's values decode.
 */
import { z } from "zod";
import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "./common.ts";

export const AgentSessionSource = forwardCompatibleLiteral(["claudeAgent", "codex", "pi"]);
export type AgentSessionSource = z.infer<typeof AgentSessionSource>;

export const AgentSessionProjectGit = z.looseObject({
  remoteKey: z.string().nullable(),
  repository: z.string().nullable(),
});
export type AgentSessionProjectGit = z.infer<typeof AgentSessionProjectGit>;

export const AgentSessionProjectCandidate = z.looseObject({
  path: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  /** The existing project at `path`. */
  projectId: ProjectId.optional(),
  sources: z.array(AgentSessionSource),
  threadCount: NonNegativeInt,
  lastActiveAt: IsoDateTime.nullable(),
  alreadyImported: z.boolean(),
  git: AgentSessionProjectGit.nullable().optional(),
});
export type AgentSessionProjectCandidate = z.infer<typeof AgentSessionProjectCandidate>;

export const AgentSessionScanResult = z.looseObject({
  candidates: z.array(AgentSessionProjectCandidate),
  scannedAt: IsoDateTime,
  /** The server reached a limit, so the scan can miss a session. */
  truncated: z.boolean().optional(),
});
export type AgentSessionScanResult = z.infer<typeof AgentSessionScanResult>;

export const AgentSessionImportInput = z.looseObject({
  projectId: ProjectId,
  /** The import refuses when the project has moved from this directory. */
  expectedWorkspaceRoot: TrimmedNonEmptyString.optional(),
});
export type AgentSessionImportInput = z.infer<typeof AgentSessionImportInput>;

export const AgentSessionImportResult = z.looseObject({
  importedCount: NonNegativeInt,
  skippedCount: NonNegativeInt,
});
export type AgentSessionImportResult = z.infer<typeof AgentSessionImportResult>;
