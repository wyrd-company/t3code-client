// ---
// relationships:
//   implements: library
// ---
/** Mirrors `packages/contracts/src/assets.ts`, and the bytes of the asset route. */
import { z } from "zod";
import { NonNegativeInt, ThreadId, TrimmedNonEmptyString, TurnItemId } from "./common.ts";
import {
  PROVIDER_SEND_TURN_MAX_FILE_BYTES,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  PROVIDER_SEND_TURN_SUPPORTED_IMAGE_MIME_TYPES,
} from "./orchestration/attachments.ts";
import { ToolActivityNativeAppReference } from "./orchestration/providerRuntime.ts";
import { ProjectFaviconPath } from "./projects.ts";

const AssetPath = TrimmedNonEmptyString.max(1024);

/** The wire tag of a source control host's credentialed media. */
export const SOURCE_CONTROL_MEDIA_ASSET = "github-media";

export const AssetResource = z.discriminatedUnion("_tag", [
  z.looseObject({ _tag: z.literal("workspace-file"), threadId: ThreadId, path: AssetPath }),
  z.looseObject({
    _tag: z.literal("media-file"),
    threadId: ThreadId,
    path: AssetPath,
    disposition: z.literal("attachment").optional(),
  }),
  z.looseObject({ _tag: z.literal("draft-workspace-file"), cwd: AssetPath, path: AssetPath }),
  z.looseObject({
    _tag: z.literal("attachment"),
    attachmentId: TrimmedNonEmptyString.max(256),
    fileName: TrimmedNonEmptyString.max(255).optional(),
    mimeType: TrimmedNonEmptyString.max(100).optional(),
    /** Defaults to download; a viewer may ask for inline after it checks that the type is safe. */
    disposition: z.enum(["inline", "attachment"]).optional(),
    renderIntent: z.literal("mcp-app").optional(),
  }),
  z.looseObject({
    _tag: z.literal("tool-output-image"),
    threadId: ThreadId,
    itemId: TurnItemId,
    index: NonNegativeInt,
  }),
  z.looseObject({
    _tag: z.literal("project-favicon"),
    cwd: AssetPath,
    path: ProjectFaviconPath.optional(),
  }),
  z.looseObject({ _tag: z.literal("native-app-icon"), app: ToolActivityNativeAppReference }),
  z.looseObject({
    _tag: z.literal(SOURCE_CONTROL_MEDIA_ASSET),
    cwd: AssetPath,
    url: TrimmedNonEmptyString.max(2048),
    /** The change request's repository, when it differs from the checkout at `cwd`. */
    repository: TrimmedNonEmptyString.max(512).optional(),
  }),
]);
export type AssetResource = z.infer<typeof AssetResource>;

export const AssetCreateUrlInput = z.looseObject({ resource: AssetResource });
export type AssetCreateUrlInput = z.infer<typeof AssetCreateUrlInput>;

export const AssetImageDimensions = z.looseObject({
  width: NonNegativeInt.min(1),
  height: NonNegativeInt.min(1),
});
export type AssetImageDimensions = z.infer<typeof AssetImageDimensions>;

export const AssetCreateUrlResult = z.looseObject({
  relativeUrl: TrimmedNonEmptyString.max(4096),
  expiresAt: z.number(),
  sourcePath: AssetPath.optional(),
  imageDimensions: AssetImageDimensions.optional(),
  /** Changes only when the file's contents or identity change; `relativeUrl` changes on every mint. */
  fileRevision: TrimmedNonEmptyString.max(256).optional(),
});
export type AssetCreateUrlResult = z.infer<typeof AssetCreateUrlResult>;

export const ATTACHMENT_UPLOAD_URL_TTL_MS = 10 * 60_000;

export const AttachmentCreateUploadUrlInput = z.union([
  z.looseObject({
    type: z.literal("image").optional(),
    name: TrimmedNonEmptyString.max(255),
    mimeType: z.enum(PROVIDER_SEND_TURN_SUPPORTED_IMAGE_MIME_TYPES),
    sizeBytes: NonNegativeInt.min(1).max(PROVIDER_SEND_TURN_MAX_IMAGE_BYTES),
  }),
  z.looseObject({
    type: z.literal("file"),
    name: TrimmedNonEmptyString.max(255),
    mimeType: TrimmedNonEmptyString.max(100),
    sizeBytes: NonNegativeInt.min(1).max(PROVIDER_SEND_TURN_MAX_FILE_BYTES),
  }),
]);
export type AttachmentCreateUploadUrlInput = z.infer<typeof AttachmentCreateUploadUrlInput>;

export const AttachmentCreateUploadUrlResult = z.looseObject({
  attachmentId: TrimmedNonEmptyString.max(256),
  relativeUrl: TrimmedNonEmptyString.max(4096),
  expiresAt: z.number(),
});
export type AttachmentCreateUploadUrlResult = z.infer<typeof AttachmentCreateUploadUrlResult>;

export const AttachmentDeleteInput = z.looseObject({
  attachmentId: TrimmedNonEmptyString.max(256),
});
export type AttachmentDeleteInput = z.infer<typeof AttachmentDeleteInput>;

/** What `assets.read` answers: the whole file and the type the server gave it. */
export const AssetContent = z.strictObject({
  bytes: z.instanceof(Uint8Array),
  contentType: z.string().optional(),
});
export type AssetContent = z.infer<typeof AssetContent>;
