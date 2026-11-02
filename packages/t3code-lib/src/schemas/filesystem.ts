// ---
// relationships:
//   implements: library
// ---
/** Mirrors `packages/contracts/src/filesystem.ts`. */
import { z } from "zod";
import { NonNegativeInt, TrimmedNonEmptyString, forwardCompatibleLiteral } from "./common.ts";

const FILESYSTEM_PATH_MAX_LENGTH = 512;

export const FILESYSTEM_METADATA_BATCH_LIMIT = 64;

export const FilesystemGetMetadataInput = z.looseObject({
  /** Absolute host paths, including `~/`; a client anchors a relative path itself. */
  paths: z
    .array(TrimmedNonEmptyString.max(FILESYSTEM_PATH_MAX_LENGTH))
    .min(1)
    .max(FILESYSTEM_METADATA_BATCH_LIMIT),
});
export type FilesystemGetMetadataInput = z.infer<typeof FilesystemGetMetadataInput>;

export const FilesystemEntryMetadata = z.looseObject({
  kind: forwardCompatibleLiteral(["file", "directory", "other"]),
  byteLength: NonNegativeInt.optional(),
  mimeType: TrimmedNonEmptyString.optional(),
});
export type FilesystemEntryMetadata = z.infer<typeof FilesystemEntryMetadata>;

/** Entries follow request order; `null` means missing, unreadable or unsupported. */
export const FilesystemGetMetadataResult = z.looseObject({
  entries: z.array(FilesystemEntryMetadata.nullable()),
});
export type FilesystemGetMetadataResult = z.infer<typeof FilesystemGetMetadataResult>;

export const FilesystemBrowseInput = z.looseObject({
  partialPath: TrimmedNonEmptyString.max(FILESYSTEM_PATH_MAX_LENGTH),
  cwd: TrimmedNonEmptyString.max(FILESYSTEM_PATH_MAX_LENGTH).optional(),
});
export type FilesystemBrowseInput = z.infer<typeof FilesystemBrowseInput>;

export const FilesystemBrowseEntry = z.looseObject({
  name: TrimmedNonEmptyString,
  fullPath: TrimmedNonEmptyString,
});
export type FilesystemBrowseEntry = z.infer<typeof FilesystemBrowseEntry>;

export const FilesystemBrowseResult = z.looseObject({
  parentPath: TrimmedNonEmptyString,
  entries: z.array(FilesystemBrowseEntry),
});
export type FilesystemBrowseResult = z.infer<typeof FilesystemBrowseResult>;
