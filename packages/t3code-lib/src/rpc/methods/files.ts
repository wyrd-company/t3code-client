// ---
// relationships:
//   implements: library
// ---
import { VoidSuccess, defineMethod } from "../spec.ts";
import {
  AssetCreateUrlInput,
  AssetCreateUrlResult,
  AttachmentCreateUploadUrlInput,
  AttachmentCreateUploadUrlResult,
  AttachmentDeleteInput,
} from "../../schemas/assets.ts";
import { LaunchEditorInput } from "../../schemas/editor.ts";
import {
  FilesystemBrowseInput,
  FilesystemBrowseResult,
  FilesystemGetMetadataInput,
  FilesystemGetMetadataResult,
} from "../../schemas/filesystem.ts";
import {
  PersistChatAttachmentsInput,
  PersistChatAttachmentsResult,
} from "../../schemas/orchestration/attachments.ts";

/** An app named by its bundle path on the host's disk, not by id or name. */
const isAppPath = (app: object): boolean => "_tag" in app && app._tag === "app-path";

export const filesMethods = {
  "filesystem.browse": defineMethod({
    payload: FilesystemBrowseInput,
    success: FilesystemBrowseResult,
    stream: false,
    scope: "filesystem:read",
  }),
  "filesystem.getMetadata": defineMethod({
    payload: FilesystemGetMetadataInput,
    success: FilesystemGetMetadataResult,
    stream: false,
    scope: "filesystem:read",
  }),
  "assets.createUrl": defineMethod({
    payload: AssetCreateUrlInput,
    success: AssetCreateUrlResult,
    stream: false,
    scope: "orchestration:read",
    // A resource on the host's disk needs the file grant and not the orchestration grant.
    scopeForPayload: ({ resource }) =>
      resource._tag === "workspace-file" ||
      resource._tag === "media-file" ||
      resource._tag === "draft-workspace-file" ||
      (resource._tag === "native-app-icon" && isAppPath(resource.app))
        ? "filesystem:read"
        : "orchestration:read",
  }),
  "assets.persistChatAttachments": defineMethod({
    payload: PersistChatAttachmentsInput,
    success: PersistChatAttachmentsResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "attachments.createUploadUrl": defineMethod({
    payload: AttachmentCreateUploadUrlInput,
    success: AttachmentCreateUploadUrlResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "attachments.delete": defineMethod({
    payload: AttachmentDeleteInput,
    success: VoidSuccess,
    stream: false,
    scope: "orchestration:operate",
  }),
  "shell.openInEditor": defineMethod({
    payload: LaunchEditorInput,
    success: VoidSuccess,
    stream: false,
    scope: "orchestration:operate",
  }),
} as const;
