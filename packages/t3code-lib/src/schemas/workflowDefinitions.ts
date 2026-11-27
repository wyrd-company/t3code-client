import { z } from "zod";

/** Something wrong with the definitions: in `file` when it is one file's, at `line` when it names one. */
export const WorkflowDefinitionProblem = z.looseObject({
  message: z.string(),
  file: z.string().optional(),
  line: z.number().optional(),
});
export type WorkflowDefinitionProblem = z.infer<typeof WorkflowDefinitionProblem>;

/** Which loading of the definitions is running, and what is wrong with the files now. */
export const WorkflowDefinitionState = z.looseObject({
  /** Goes up whenever the definitions load or are found wrong, so a client reads them again. */
  revision: z.number(),
  /** Why the files on disk are not what runs. The last version that loaded keeps running. */
  problem: z.string().nullable(),
});
export type WorkflowDefinitionState = z.infer<typeof WorkflowDefinitionState>;

export const WorkflowDefinitionFile = z.looseObject({
  name: z.string(),
  /** The file as it is on disk, which is not what runs while it has problems. */
  source: z.string(),
  /** The workflows its last good version defines, each as `name@version`. */
  workflows: z.array(z.string()),
  problems: z.array(WorkflowDefinitionProblem),
});
export type WorkflowDefinitionFile = z.infer<typeof WorkflowDefinitionFile>;

/** The files that define this server's workflows. */
export const WorkflowDefinitionFiles = z.looseObject({
  /** The folder the files are in. */
  directory: z.string(),
  /** The server was pointed at one file: none can be added beside it or taken away. */
  single: z.boolean(),
  files: z.array(WorkflowDefinitionFile),
  /** What is wrong between files, such as one workflow defined in two of them. */
  problems: z.array(WorkflowDefinitionProblem),
  ...WorkflowDefinitionState.shape,
});
export type WorkflowDefinitionFiles = z.infer<typeof WorkflowDefinitionFiles>;

export const WorkflowDefinitionGetInput = z.looseObject({});
/** A file by its name in the folder. Saving a name that is not there yet makes the file. */
export const WorkflowDefinitionSaveInput = z.looseObject({ name: z.string(), source: z.string() });
export type WorkflowDefinitionSaveInput = z.infer<typeof WorkflowDefinitionSaveInput>;
export const WorkflowDefinitionDeleteInput = z.looseObject({ name: z.string() });
export type WorkflowDefinitionDeleteInput = z.infer<typeof WorkflowDefinitionDeleteInput>;
export const WorkflowDefinitionChangeResult = z.looseObject({
  /** The file was written or deleted. */
  changed: z.boolean(),
  /** Empty when the change is what runs now. With `changed`, why it does not run yet. */
  problems: z.array(WorkflowDefinitionProblem),
});
export type WorkflowDefinitionChangeResult = z.infer<typeof WorkflowDefinitionChangeResult>;
