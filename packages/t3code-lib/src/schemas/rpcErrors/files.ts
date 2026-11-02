/** Tagged failures of the file RPC methods, mirroring the contracts' `assets.ts`, `chatAttachment.ts`, `editor.ts` and `filesystem.ts`. */
import { z } from "zod";
import { AssetResource } from "../assets.ts";
import { TrimmedNonEmptyString, forwardCompatibleLiteral } from "../common.ts";
import { EditorId } from "../editor.ts";
import { Defect, messageAndCause, taggedError } from "./shared.ts";

export const FilesystemBrowseFailure = forwardCompatibleLiteral([
  "windows_path_unsupported",
  "current_project_required",
  "read_directory_failed",
]);
export const FilesystemBrowseError = taggedError("FilesystemBrowseError", {
  partialPath: TrimmedNonEmptyString.optional(),
  cwd: TrimmedNonEmptyString.optional(),
  failure: FilesystemBrowseFailure.optional(),
  parentPath: TrimmedNonEmptyString.optional(),
  platform: TrimmedNonEmptyString.optional(),
  ...messageAndCause,
});

const assetFailure = { resource: AssetResource };
const assetFailureWithCause = { resource: AssetResource, cause: Defect };

export const AssetWorkspaceContextNotFoundError = taggedError(
  "AssetWorkspaceContextNotFoundError",
  assetFailure,
);
export const AssetWorkspaceContextResolutionError = taggedError(
  "AssetWorkspaceContextResolutionError",
  assetFailureWithCause,
);
export const AssetWorkspaceRootNormalizationError = taggedError(
  "AssetWorkspaceRootNormalizationError",
  assetFailureWithCause,
);
export const AssetWorkspacePathValidationError = taggedError(
  "AssetWorkspacePathValidationError",
  assetFailureWithCause,
);
export const AssetPreviewTypeValidationError = taggedError(
  "AssetPreviewTypeValidationError",
  assetFailure,
);
export const AssetWorkspaceAssetInspectionError = taggedError(
  "AssetWorkspaceAssetInspectionError",
  assetFailureWithCause,
);
export const AssetWorkspaceAssetNotFoundError = taggedError("AssetWorkspaceAssetNotFoundError", {
  ...assetFailure,
  checkedPath: z.string().optional(),
});
export const AssetWorkspaceResolutionError = taggedError(
  "AssetWorkspaceResolutionError",
  assetFailureWithCause,
);
export const AssetAttachmentNotFoundError = taggedError(
  "AssetAttachmentNotFoundError",
  assetFailure,
);
export const AssetProjectFaviconResolutionError = taggedError(
  "AssetProjectFaviconResolutionError",
  assetFailureWithCause,
);
export const AssetProjectFaviconInspectionError = taggedError(
  "AssetProjectFaviconInspectionError",
  assetFailureWithCause,
);
export const AssetProjectFaviconNotFoundError = taggedError(
  "AssetProjectFaviconNotFoundError",
  assetFailure,
);
export const AssetSigningKeyLoadError = taggedError(
  "AssetSigningKeyLoadError",
  assetFailureWithCause,
);
/** The contracts class is `AssetSourceControlMediaUrlValidationError`; this is its wire tag. */
export const AssetSourceControlMediaUrlValidationError = taggedError(
  "AssetGitHubMediaUrlValidationError",
  {},
);

export const AttachmentUploadSigningKeyError = taggedError("AttachmentUploadSigningKeyError", {
  cause: Defect,
});
export const PersistChatAttachmentsError = taggedError("PersistChatAttachmentsError", {
  message: z.string(),
  cause: Defect.optional(),
});

export const ExternalLauncherUnknownEditorError = taggedError(
  "ExternalLauncherUnknownEditorError",
  { editor: z.string() },
);
export const ExternalLauncherUnsupportedEditorError = taggedError(
  "ExternalLauncherUnsupportedEditorError",
  { editor: EditorId },
);
export const ExternalLauncherCommandNotFoundError = taggedError(
  "ExternalLauncherCommandNotFoundError",
  { editor: EditorId, command: z.string() },
);
export const ExternalLauncherUnsupportedTargetError = taggedError(
  "ExternalLauncherUnsupportedTargetError",
  { editor: EditorId },
);
const launcherSpawnFields = { command: z.string(), args: z.array(z.string()), cause: Defect };
export const ExternalLauncherBrowserSpawnError = taggedError("ExternalLauncherBrowserSpawnError", {
  ...launcherSpawnFields,
  target: z.string(),
});
export const ExternalLauncherEditorSpawnError = taggedError("ExternalLauncherEditorSpawnError", {
  ...launcherSpawnFields,
  editor: EditorId,
  target: z.string(),
});

/** Each failure of this file, in the order `RpcErrorRecord` lists them. */
export const fileRpcErrors = [
  FilesystemBrowseError,
  AssetWorkspaceContextNotFoundError,
  AssetWorkspaceContextResolutionError,
  AssetWorkspaceRootNormalizationError,
  AssetWorkspacePathValidationError,
  AssetPreviewTypeValidationError,
  AssetWorkspaceAssetInspectionError,
  AssetWorkspaceAssetNotFoundError,
  AssetWorkspaceResolutionError,
  AssetAttachmentNotFoundError,
  AssetProjectFaviconResolutionError,
  AssetProjectFaviconInspectionError,
  AssetProjectFaviconNotFoundError,
  AssetSigningKeyLoadError,
  AssetSourceControlMediaUrlValidationError,
  AttachmentUploadSigningKeyError,
  PersistChatAttachmentsError,
  ExternalLauncherUnknownEditorError,
  ExternalLauncherUnsupportedEditorError,
  ExternalLauncherCommandNotFoundError,
  ExternalLauncherUnsupportedTargetError,
  ExternalLauncherBrowserSpawnError,
  ExternalLauncherEditorSpawnError,
] as const;
