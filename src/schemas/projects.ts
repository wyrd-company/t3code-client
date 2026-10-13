// ---
// relationships:
//   implements: design
// ---
import { z } from "zod";
import { TrimmedString } from "./common.ts";
import {
  CommandId,
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  isUnknownVariant,
  taggedUnionWithUnknown,
} from "./common.ts";
import { RepositoryIdentity, ThreadEnvMode } from "./environment.ts";
import { ModelSelection } from "./orchestration/model.ts";

export const PROJECT_SEARCH_ENTRIES_MAX_LIMIT = 200;
export const ProjectEntryKind = forwardCompatibleLiteral(["file", "directory"]);
export type ProjectEntryKind = z.infer<typeof ProjectEntryKind>;
export const ProjectSearchEntriesInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  query: TrimmedString.max(256),
  limit: PositiveInt.max(PROJECT_SEARCH_ENTRIES_MAX_LIMIT),
  kind: ProjectEntryKind.optional(),
  imageOnly: z.boolean().optional(),
});
export type ProjectSearchEntriesInput = z.infer<typeof ProjectSearchEntriesInput>;
export const ProjectEntry = z.looseObject({
  path: TrimmedNonEmptyString,
  kind: ProjectEntryKind,
  ignored: z.boolean().optional(),
});
export type ProjectEntry = z.infer<typeof ProjectEntry>;
export const ProjectSearchEntriesResult = z.looseObject({
  entries: z.array(ProjectEntry),
  truncated: z.boolean(),
});
export type ProjectSearchEntriesResult = z.infer<typeof ProjectSearchEntriesResult>;
export const PROJECT_SEARCH_CONTENTS_MAX_LIMIT = 500;
export const ProjectSearchContentsInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  query: z.string().min(1).max(256),
  limit: PositiveInt.max(PROJECT_SEARCH_CONTENTS_MAX_LIMIT),
  caseSensitive: z.boolean(),
  wholeWord: z.boolean(),
  useRegex: z.boolean(),
});
export type ProjectSearchContentsInput = z.infer<typeof ProjectSearchContentsInput>;
export const ProjectContentMatchRange = z.looseObject({
  start: NonNegativeInt,
  end: NonNegativeInt,
});
export type ProjectContentMatchRange = z.infer<typeof ProjectContentMatchRange>;
export const ProjectContentMatch = z.looseObject({
  path: TrimmedNonEmptyString,
  lineNumber: PositiveInt,
  lineContent: z.string(),
  matchRanges: z.array(ProjectContentMatchRange),
});
export type ProjectContentMatch = z.infer<typeof ProjectContentMatch>;
export const ProjectSearchContentsResult = z.looseObject({
  matches: z.array(ProjectContentMatch),
  truncated: z.boolean(),
  regexFallbackError: z.string().optional(),
});
export type ProjectSearchContentsResult = z.infer<typeof ProjectSearchContentsResult>;
export const ProjectListEntriesInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  directoryPath: TrimmedString.optional(),
});
export type ProjectListEntriesInput = z.infer<typeof ProjectListEntriesInput>;
export const ProjectListEntriesResult = z.looseObject({
  entries: z.array(ProjectEntry),
  truncated: z.boolean(),
});
export type ProjectListEntriesResult = z.infer<typeof ProjectListEntriesResult>;
export const PROJECT_READ_FILE_PATH_MAX_LENGTH = 512;
export const ProjectReadFileInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.max(PROJECT_READ_FILE_PATH_MAX_LENGTH),
});
export type ProjectReadFileInput = z.infer<typeof ProjectReadFileInput>;
export const ProjectReadFileResult = z.looseObject({
  relativePath: TrimmedNonEmptyString,
  contents: z.string(),
  byteLength: NonNegativeInt,
  truncated: z.boolean(),
});
export type ProjectReadFileResult = z.infer<typeof ProjectReadFileResult>;
export const PROJECT_WRITE_FILE_PATH_MAX_LENGTH = 512;
export const ProjectWriteFileInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.max(PROJECT_WRITE_FILE_PATH_MAX_LENGTH),
  contents: z.string(),
});
export type ProjectWriteFileInput = z.infer<typeof ProjectWriteFileInput>;
export const ProjectWriteFileResult = z.looseObject({ relativePath: TrimmedNonEmptyString });
export type ProjectWriteFileResult = z.infer<typeof ProjectWriteFileResult>;
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

// project.ts: project records, icons, and mutations

export const ProjectScriptIcon = forwardCompatibleLiteral([
  "play",
  "test",
  "lint",
  "configure",
  "build",
  "debug",
]);
export type ProjectScriptIcon = z.infer<typeof ProjectScriptIcon>;
export const ProjectScript = z.looseObject({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  command: TrimmedNonEmptyString,
  icon: ProjectScriptIcon,
  runOnWorktreeCreate: z.boolean(),
  /** Run in the thread's worktree each time the thread settles. */
  runOnSettle: z.boolean().optional(),
  /** Start the agent while setup runs unless explicitly disabled. */
  async: z.boolean().optional(),
  previewUrl: TrimmedNonEmptyString.optional(),
  autoOpenPreview: z.boolean().optional(),
});
export type ProjectScript = z.infer<typeof ProjectScript>;

export const ProjectIconColor = forwardCompatibleLiteral([
  "gray",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
]);
export type ProjectIconColor = z.infer<typeof ProjectIconColor>;
export const ProjectLucideIconName = TrimmedNonEmptyString.max(64).regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
);
export const ProjectEmoji = TrimmedNonEmptyString.max(32);
/** Grapheme count is checked by the server when a command sets the icon, not when a snapshot decodes. */
export const ProjectMonogramText = TrimmedNonEmptyString.max(32).regex(
  /^[\p{L}\p{N}][\p{L}\p{N}\p{M}\u200c\u200d]*$/u,
);
export type ProjectMonogramText = z.infer<typeof ProjectMonogramText>;
export const ProjectFaviconPath = TrimmedNonEmptyString.max(1024).regex(
  /\.(?:avif|gif|icns|ico|jpe?g|png|svg|webp)$/i,
);
export type ProjectFaviconPath = z.infer<typeof ProjectFaviconPath>;

const ProjectLucideIcon = z.looseObject({
  kind: z.literal("lucide"),
  name: ProjectLucideIconName,
  color: ProjectIconColor,
});
const ProjectEmojiIcon = z.looseObject({ kind: z.literal("emoji"), emoji: ProjectEmoji });
const ProjectMonogramIcon = z.looseObject({
  kind: z.literal("monogram"),
  text: ProjectMonogramText,
  color: ProjectIconColor,
});
/** A project's chosen icon, as clients set it. */
export const ProjectIconOverride = z.discriminatedUnion("kind", [
  ProjectLucideIcon,
  ProjectEmojiIcon,
  ProjectMonogramIcon,
]);
export type ProjectIconOverride = z.infer<typeof ProjectIconOverride>;

/**
 * An icon as clients receive it. Servers once sent a monogram as a Lucide
 * icon carrying its text; that shape still decodes as `kind: "monogram"`. A
 * kind from a newer server decodes as `null`, no override.
 */
export const ReceivedProjectIcon: z.ZodType<ProjectIconOverride | null, unknown> =
  taggedUnionWithUnknown("kind", [
    z.looseObject({
      ...ProjectLucideIcon.shape,
      monogramText: ProjectMonogramText.optional(),
      monogram: ProjectMonogramText.optional(),
    }),
    ProjectEmojiIcon,
    ProjectMonogramIcon,
  ]).transform((icon): ProjectIconOverride | null => {
    if (isUnknownVariant<"kind">(icon)) return null;
    if (icon.kind !== "lucide") return icon;
    const text = icon.monogramText ?? icon.monogram;
    return text === undefined
      ? { kind: "lucide", name: icon.name, color: icon.color }
      : { kind: "monogram", text, color: icon.color };
  });

export const Project = z.looseObject({
  id: ProjectId,
  title: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
  repositoryIdentity: RepositoryIdentity.nullable().optional(),
  faviconPath: TrimmedNonEmptyString.nullable().optional(),
  projectIcon: ReceivedProjectIcon.nullable().optional(),
  defaultModelSelection: ModelSelection.nullable(),
  defaultThreadEnvMode: ThreadEnvMode.nullable().optional(),
  autoPull: z.boolean().optional(),
  scripts: z.array(ProjectScript),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: IsoDateTime.nullable(),
});
export type Project = z.infer<typeof Project>;

export const ProjectSnapshot = z.looseObject({
  projects: z.array(Project),
  updatedAt: IsoDateTime,
});
export type ProjectSnapshot = z.infer<typeof ProjectSnapshot>;

export const ProjectCreatePayload = z.looseObject({
  title: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
  createWorkspaceRootIfMissing: z.boolean().optional(),
  defaultModelSelection: ModelSelection.nullable().optional(),
  scripts: z.array(ProjectScript).optional(),
});
export type ProjectCreatePayload = z.infer<typeof ProjectCreatePayload>;
export const ProjectUpdatePayload = z.looseObject({
  title: TrimmedNonEmptyString.optional(),
  workspaceRoot: TrimmedNonEmptyString.optional(),
  defaultModelSelection: ModelSelection.nullable().optional(),
  autoPull: z.boolean().optional(),
  projectIcon: ProjectIconOverride.nullable().optional(),
  faviconPath: TrimmedNonEmptyString.nullable().optional(),
  defaultThreadEnvMode: ThreadEnvMode.nullable().optional(),
  scripts: z.array(ProjectScript).optional(),
});
export type ProjectUpdatePayload = z.infer<typeof ProjectUpdatePayload>;

/** What `projects.mutate` and `POST /api/projects/mutate` accept. */
export const ProjectMutation = z.discriminatedUnion("type", [
  z.looseObject({
    type: z.literal("project.create"),
    commandId: CommandId,
    projectId: ProjectId,
    ...ProjectCreatePayload.shape,
  }),
  z.looseObject({
    type: z.literal("project.update"),
    commandId: CommandId,
    projectId: ProjectId,
    ...ProjectUpdatePayload.shape,
  }),
  z.looseObject({
    type: z.literal("project.delete"),
    commandId: CommandId,
    projectId: ProjectId,
    force: z.boolean().optional(),
  }),
]);
export type ProjectMutation = z.infer<typeof ProjectMutation>;
