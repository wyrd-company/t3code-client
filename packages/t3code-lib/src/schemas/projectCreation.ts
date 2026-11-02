// ---
// relationships:
//   implements: library
// ---
/** The server-side project creators: Scratch, from a name, and from a thread's folder. */
import { z } from "zod";
import { ProjectId, ThreadId, TrimmedNonEmptyString } from "./common.ts";

/** The environment's Scratch project, created on first request. */
export const ProjectEnsureScratchResult = z.looseObject({ projectId: ProjectId });
export type ProjectEnsureScratchResult = z.infer<typeof ProjectEnsureScratchResult>;
export const PROJECT_CREATE_NEW_NAME_MAX_LENGTH = 200;
/** A project started from just a name, in a new folder the server makes. */
export const ProjectCreateNewInput = z.looseObject({
  name: TrimmedNonEmptyString.max(PROJECT_CREATE_NEW_NAME_MAX_LENGTH),
});
export type ProjectCreateNewInput = z.infer<typeof ProjectCreateNewInput>;
export const ProjectCreateNewResult = z.looseObject({
  projectId: ProjectId,
  workspaceRoot: TrimmedNonEmptyString,
  /** Why the first commit failed. The project and its files exist either way. */
  commitError: TrimmedNonEmptyString.optional(),
});
export type ProjectCreateNewResult = z.infer<typeof ProjectCreateNewResult>;
/** A No project thread whose own folder becomes a project in place. */
export const ProjectCreateFromThreadInput = z.looseObject({ threadId: ThreadId });
export type ProjectCreateFromThreadInput = z.infer<typeof ProjectCreateFromThreadInput>;
export const ProjectCreateFromThreadResult = z.looseObject({ projectId: ProjectId });
export type ProjectCreateFromThreadResult = z.infer<typeof ProjectCreateFromThreadResult>;
