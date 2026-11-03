// ---
// relationships:
//   implements: library-wire
// ---
/**
 * The viewer socket of a server browser tab, `/api/preview-stream/ws`, and the two
 * routes beside it. Upstream has no contract for these messages: they mirror
 * `ServerBrowserViewerOutput` and `dispatchViewerInput` in `ServerBrowser.ts`.
 */
import { z } from "zod";
import {
  NonNegativeInt,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "./common.ts";
import { PreviewTabId, PreviewViewportInput } from "./preview.ts";

const tabRef = { threadId: ThreadId, tabId: PreviewTabId } as const;

/** Where a viewer attaches. The server caps a larger size or quality. */
export const PreviewViewerTarget = z.strictObject({
  ...tabRef,
  maxWidth: z.number().int().positive().optional(),
  maxHeight: z.number().int().positive().optional(),
  /** JPEG quality of a frame, 1 to 100. */
  quality: z.number().int().min(1).max(100).optional(),
  /** `false` only watches. A session without `preview:operate` also only watches. */
  interactive: z.boolean().optional(),
});
export type PreviewViewerTarget = z.infer<typeof PreviewViewerTarget>;

/** A sum of the alt 1, ctrl 2, meta 4 and shift 8 bits. */
const Modifiers = z.number().int().min(0).max(15);
const point = { x: z.number(), y: z.number() } as const;

/** What a viewer sends. The server drops input from a viewer that only watches. */
export const PreviewViewerInput = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("takeControl") }),
  z.strictObject({ type: z.literal("releaseControl") }),
  z.strictObject({
    type: z.literal("dialog"),
    accept: z.boolean(),
    promptText: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("mouse"),
    action: z.enum(["down", "up", "move"]),
    ...point,
    button: z.enum(["none", "left", "middle", "right"]).optional(),
    buttons: z.number().int().min(0).optional(),
    clickCount: z.number().int().min(0).optional(),
    modifiers: Modifiers.optional(),
  }),
  z.strictObject({
    type: z.literal("wheel"),
    ...point,
    deltaX: z.number(),
    deltaY: z.number(),
    modifiers: Modifiers.optional(),
  }),
  z.strictObject({
    type: z.literal("key"),
    action: z.enum(["down", "up"]),
    key: z.string(),
    code: z.string(),
    text: z.string().optional(),
    keyCode: z.number().int().optional(),
    modifiers: Modifiers.optional(),
  }),
  /** The server inserts the first 10,000 characters. */
  z.strictObject({ type: z.literal("text"), text: z.string().min(1) }),
  /** The size that this viewer draws, which a `fill` tab follows. Below 100 has no effect. */
  z.strictObject({
    type: z.literal("resize"),
    width: z.number().int().min(100).max(3840),
    height: z.number().int().min(100).max(2160),
  }),
  z.strictObject({ type: z.literal("viewport"), setting: PreviewViewportInput }),
  z.strictObject({ type: z.literal("navigate"), url: TrimmedNonEmptyString.max(2048) }),
  /** Back when below zero, and forward otherwise. */
  z.strictObject({ type: z.literal("history"), delta: z.number().int() }),
  z.strictObject({ type: z.literal("reload"), ignoreCache: z.boolean().optional() }),
  /** Asks if the point is editable. The answer is a `probe` message. */
  z.strictObject({ type: z.literal("probe"), ...point }),
]);
export type PreviewViewerInput = z.infer<typeof PreviewViewerInput>;

/** What the server sends as JSON text. A frame is a binary message and has no entry here. */
export const PreviewViewerMessage = taggedUnionWithUnknown("type", [
  z.looseObject({ type: z.literal("viewport"), width: z.number(), height: z.number() }),
  z.looseObject({
    type: z.literal("control"),
    canOperate: z.boolean(),
    controller: forwardCompatibleLiteral(["agent", "you", "another-viewer", "unclaimed"]),
    generation: z.number(),
    dialog: z
      .looseObject({ type: z.string(), message: z.string(), defaultValue: z.string() })
      .nullable(),
  }),
  z.looseObject({ type: z.literal("probe"), ...point, editable: z.boolean() }),
  z.looseObject({ type: z.literal("clipboard"), text: z.string() }),
  z.looseObject({
    type: z.literal("pointer"),
    phase: forwardCompatibleLiteral(["move", "click"]),
    ...point,
    sequence: z.number(),
  }),
  /** Answer with `previewStream.upload`, as the viewer that controls the tab. */
  z.looseObject({
    type: z.literal("fileChooser"),
    id: z.string(),
    multiple: z.boolean(),
    accept: z.string(),
  }),
  z.looseObject({ type: z.literal("fileChooserClosed"), id: z.string() }),
  z.looseObject({ type: z.literal("popup"), tabId: z.string() }),
  /** Read the file with `previewStream.download`. */
  z.looseObject({
    type: z.literal("download"),
    id: z.string(),
    fileName: z.string(),
    sizeBytes: NonNegativeInt,
  }),
]);
export type PreviewViewerMessage = z.infer<typeof PreviewViewerMessage>;

/** The reason of close code 4503: what the host needs before its browser can start. */
export const PreviewStreamHostSetup = z.looseObject({
  need: forwardCompatibleLiteral(["sandbox", "libraries"]),
  command: z.string(),
});
export type PreviewStreamHostSetup = z.infer<typeof PreviewStreamHostSetup>;

export const PreviewDownloadQuery = z.strictObject({
  ...tabRef,
  /** The `id` of a `download` viewer message. */
  id: z.string().min(1),
});
export type PreviewDownloadQuery = z.infer<typeof PreviewDownloadQuery>;

export const PreviewDownloadContent = z.object({
  bytes: z.instanceof(Uint8Array),
  contentType: z.string().optional(),
});
export type PreviewDownloadContent = z.infer<typeof PreviewDownloadContent>;

export const PreviewUploadQuery = z.strictObject({
  ...tabRef,
  /** The `id` of a `fileChooser` viewer message. */
  chooser: z.string().min(1),
});
export type PreviewUploadQuery = z.infer<typeof PreviewUploadQuery>;

const PREVIEW_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

export const PreviewUploadFile = z.strictObject({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  bytes: z.instanceof(Uint8Array),
});
export type PreviewUploadFile = z.infer<typeof PreviewUploadFile>;

/** The server takes at most 20 files and 100 MiB in all. A single-file picker keeps the first. */
export const PreviewUploadBody = z
  .strictObject({ files: z.array(PreviewUploadFile).max(20) })
  .refine(
    ({ files }) =>
      files.reduce((total, file) => total + file.bytes.byteLength, 0) <= PREVIEW_UPLOAD_MAX_BYTES,
    "The files are over 100 MiB in all.",
  );
export type PreviewUploadBody = z.infer<typeof PreviewUploadBody>;
