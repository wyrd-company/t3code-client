/** Tagged failures of the preview RPC methods, mirroring the contracts' `preview.ts`. */
import { z } from "zod";
import { forwardCompatibleLiteral } from "../common.ts";
import { Defect, taggedError } from "./shared.ts";

export const PreviewSessionLookupError = taggedError("PreviewSessionLookupError", {
  threadId: z.string(),
  tabId: z.string(),
});
export const PreviewInvalidUrlError = taggedError("PreviewInvalidUrlError", {
  inputLength: z.number(),
  reason: forwardCompatibleLiteral(["empty", "parse", "unsupported-protocol", "unexpected"]),
  protocol: z.string().optional(),
  cause: Defect,
});
export const PreviewControlRequiredError = taggedError("PreviewControlRequiredError", {
  tabId: z.string(),
});
export const PreviewClearProfileError = taggedError("PreviewClearProfileError", {
  profileId: z.string(),
  cause: Defect,
});
export const PreviewStopLocalServerError = taggedError("PreviewStopLocalServerError", {
  reason: forwardCompatibleLiteral(["not-found", "shared-group", "unsupported", "signal-failed"]),
  cause: Defect.optional(),
});

export const previewRpcErrors = [
  PreviewSessionLookupError,
  PreviewInvalidUrlError,
  PreviewControlRequiredError,
  PreviewClearProfileError,
  PreviewStopLocalServerError,
] as const;
