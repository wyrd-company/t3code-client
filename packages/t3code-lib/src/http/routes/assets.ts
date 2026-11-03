// ---
// relationships:
//   implements: library-wire
// ---
/**
 * The two routes that carry file bytes. Each URL is signed by the server and is
 * itself the credential, so neither route sends the session's token.
 */
import { z } from "zod";

import { T3PreconditionError } from "../../errors.ts";
import { AssetContent } from "../../schemas/assets.ts";
import { defineRoute } from "../spec.ts";

const ASSET_PREFIX = "/api/assets/";
const UPLOAD_PREFIX = "/api/attachments/upload/";

const SignedToken = z.string().regex(/^[\w-]+\.[\w-]+$/u);
/** A dot segment would leave the route when the URL is normalized. */
const AssetFilePath = z
  .string()
  .min(1)
  .refine((path) => path !== "." && path !== "..");

export const assetRoutes = {
  "assets.read": defineRoute({
    method: "GET",
    path: "/api/assets/:token/:path",
    auth: "none",
    input: z.strictObject({ params: z.strictObject({ token: SignedToken, path: AssetFilePath }) }),
    success: AssetContent,
    binaryResponse: true,
    signedPath: true,
  }),
  "attachments.upload": defineRoute({
    method: "POST",
    path: "/api/attachments/upload/:token",
    auth: "none",
    input: z.strictObject({
      params: z.strictObject({ token: SignedToken }),
      body: z.instanceof(Uint8Array),
    }),
    success: z.undefined(),
    signedPath: true,
  }),
};

/** The `assets.read` params of a `relativeUrl` from `assets.createUrl`. */
export function assetUrlParams(relativeUrl: string): { token: string; path: string } {
  const suffix = signedSuffix(relativeUrl, ASSET_PREFIX);
  const separator = suffix.indexOf("/");
  if (separator <= 0) throw malformed(ASSET_PREFIX);
  try {
    return {
      token: suffix.slice(0, separator),
      path: decodeURIComponent(suffix.slice(separator + 1)),
    };
  } catch {
    throw malformed(ASSET_PREFIX);
  }
}

/** The `attachments.upload` params of a `relativeUrl` from `attachments.createUploadUrl`. */
export function attachmentUploadUrlParams(relativeUrl: string): { token: string } {
  return { token: signedSuffix(relativeUrl, UPLOAD_PREFIX) };
}

function signedSuffix(relativeUrl: string, prefix: string): string {
  if (!relativeUrl.startsWith(prefix)) throw malformed(prefix);
  return relativeUrl.slice(prefix.length);
}

/** The message leaves out the URL, because the URL is a credential. */
function malformed(prefix: string): T3PreconditionError {
  return new T3PreconditionError(`The signed URL is not under ${prefix}.`);
}
