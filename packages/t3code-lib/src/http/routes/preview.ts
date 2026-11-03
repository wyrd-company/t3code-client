// ---
// relationships:
//   implements: library-wire
// ---
/**
 * The two HTTP routes of a server browser tab. A viewer's messages name their ids.
 * The viewer's third path, `/api/preview-stream/ws`, is a socket: `T3Client.openPreviewViewer`.
 */
import { z } from "zod";

import {
  PreviewDownloadContent,
  PreviewDownloadQuery,
  PreviewUploadBody,
  PreviewUploadQuery,
} from "../../schemas/previewViewer.ts";
import { defineRoute } from "../spec.ts";

export const previewRoutes = {
  "previewStream.download": defineRoute({
    method: "GET",
    path: "/api/preview-stream/download",
    auth: "required",
    scope: "orchestration:read",
    input: z.strictObject({ query: PreviewDownloadQuery }),
    success: PreviewDownloadContent,
    binaryResponse: true,
  }),
  "previewStream.upload": defineRoute({
    method: "POST",
    path: "/api/preview-stream/upload",
    auth: "required",
    scope: "preview:operate",
    input: z.strictObject({ query: PreviewUploadQuery, body: PreviewUploadBody }),
    success: z.undefined(),
    multipart: true,
  }),
};
