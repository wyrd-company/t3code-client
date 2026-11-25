// ---
// relationships:
//   implements: library
// ---
/** The folders a project works in besides its home folder (`project.ts` in upstream contracts). */
import { z } from "zod";
import { TrimmedNonEmptyString } from "./common.ts";

export const PROJECT_TRACKED_FOLDERS_MAX = 128;

/**
 * A folder the project works in besides its home folder. Paths are absolute and only mean
 * something on the project's own environment. Git folders get their own history and review.
 */
export const ProjectTrackedFolder = z.looseObject({
  path: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString.max(128),
  /** The server found this repository inside the project folder and keeps it in step with the disk. */
  discovered: z.boolean().optional(),
});
export type ProjectTrackedFolder = z.infer<typeof ProjectTrackedFolder>;

/** The folders a project reads as tracked. Absent from older servers: a single-folder project. */
export const ProjectTrackedFolders = z.array(ProjectTrackedFolder).max(PROJECT_TRACKED_FOLDERS_MAX);
export type ProjectTrackedFolders = z.infer<typeof ProjectTrackedFolders>;

/** A folder a caller adds. Which repositories sit inside the project folder is the server's to say. */
export const ProjectAddedFolder = z.looseObject({
  path: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString.max(128),
});
export type ProjectAddedFolder = z.infer<typeof ProjectAddedFolder>;

export const ProjectAddedFolders = z.array(ProjectAddedFolder).max(PROJECT_TRACKED_FOLDERS_MAX);
export type ProjectAddedFolders = z.infer<typeof ProjectAddedFolders>;
