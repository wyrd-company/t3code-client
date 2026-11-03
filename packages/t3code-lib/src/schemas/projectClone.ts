// ---
// relationships:
//   implements: library
// ---
/**
 * The tracked clone of a new project. Mirrors `packages/contracts/src/projectClone.ts`.
 * An input has the contracts' closed values. A result stays open, so a newer
 * server's values decode.
 */
import { z } from "zod";
import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "./common.ts";
import { SourceControlCloneSourceFields, SourceControlRepositoryInfo } from "./sourceControl.ts";

export const ProjectCloneStage = forwardCompatibleLiteral([
  "connecting",
  "counting",
  "receiving",
  "resolving",
  "checkout",
]);
export type ProjectCloneStage = z.infer<typeof ProjectCloneStage>;

export const ProjectClonePhase = forwardCompatibleLiteral([
  "running",
  "done",
  "failed",
  "cancelled",
]);
export type ProjectClonePhase = z.infer<typeof ProjectClonePhase>;

export const ProjectCloneSnapshot = z.looseObject({
  projectId: ProjectId,
  /** Has no credentials. */
  remoteUrl: TrimmedNonEmptyString,
  destinationPath: TrimmedNonEmptyString,
  repository: SourceControlRepositoryInfo.nullable(),
  phase: ProjectClonePhase,
  stage: ProjectCloneStage,
  percent: z.number().int().min(0).max(100).nullable(),
  detail: z.string().max(200).nullable(),
  /** Git has printed nothing for a while, so `detail` is no longer current. */
  stalled: z.boolean().optional(),
  error: z.string().max(1000).nullable(),
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.nullable(),
  sequence: NonNegativeInt,
});
export type ProjectCloneSnapshot = z.infer<typeof ProjectCloneSnapshot>;

/** Each stream item lists every clone that the server tracks. */
export const ProjectCloneListEvent = z.array(ProjectCloneSnapshot);
export type ProjectCloneListEvent = z.infer<typeof ProjectCloneListEvent>;

export const ProjectCloneStartInput = z.looseObject({
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
  ...SourceControlCloneSourceFields,
});
export type ProjectCloneStartInput = z.infer<typeof ProjectCloneStartInput>;

export const ProjectCloneStartResult = z.looseObject({
  projectId: ProjectId,
  cwd: TrimmedNonEmptyString,
  remoteUrl: TrimmedNonEmptyString,
  repository: SourceControlRepositoryInfo.nullable(),
});
export type ProjectCloneStartResult = z.infer<typeof ProjectCloneStartResult>;

export const ProjectCloneActionInput = z.looseObject({ projectId: ProjectId });
export type ProjectCloneActionInput = z.infer<typeof ProjectCloneActionInput>;

/** `applied` is `false` when the clone is not in a phase that the action can change. */
export const ProjectCloneActionResult = z.looseObject({ applied: z.boolean() });
export type ProjectCloneActionResult = z.infer<typeof ProjectCloneActionResult>;
