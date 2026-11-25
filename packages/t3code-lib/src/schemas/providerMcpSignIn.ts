// ---
// relationships:
//   implements: library
// ---
/**
 * Signing an agent's MCP server in from the thread whose session asked for it (`provider.ts`):
 * `provider.mcpSignIn.start` returns the page to approve on, and `complete` takes the address
 * the browser was sent to afterwards. A `system_notice` with `mcpSignIn` names the server.
 */
import { z } from "zod";
import { IsoDateTime, ProviderThreadId, ThreadId, TrimmedNonEmptyString } from "./common.ts";
import { SignInUrl } from "./providerSetup.ts";

export const ProviderMcpSignInStartInput = z.looseObject({
  threadId: ThreadId,
  providerThreadId: ProviderThreadId,
  server: TrimmedNonEmptyString.max(256),
});
export type ProviderMcpSignInStartInput = z.infer<typeof ProviderMcpSignInStartInput>;

export const ProviderMcpSignInStartResult = z.looseObject({
  /** The page to approve the sign-in on; null when the server needs none any more. */
  authorizationUrl: SignInUrl.nullable(),
  /** The environment's time when it found the server already signed in. */
  signedInAt: IsoDateTime.nullable(),
});
export type ProviderMcpSignInStartResult = z.infer<typeof ProviderMcpSignInStartResult>;

export const ProviderMcpSignInCompleteInput = z.looseObject({
  ...ProviderMcpSignInStartInput.shape,
  /** The address the browser was sent to after approving, usually a localhost page. */
  callbackUrl: TrimmedNonEmptyString.max(16_384),
});
export type ProviderMcpSignInCompleteInput = z.infer<typeof ProviderMcpSignInCompleteInput>;

export const ProviderMcpSignInCompleteResult = z.looseObject({
  /** The environment's time, so a later notice that needs a sign-in again offers one. */
  signedInAt: IsoDateTime,
});
export type ProviderMcpSignInCompleteResult = z.infer<typeof ProviderMcpSignInCompleteResult>;
