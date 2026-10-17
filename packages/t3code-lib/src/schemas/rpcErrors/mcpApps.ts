/** Tagged failure of the MCP Apps RPC methods, mirroring the contracts' `mcpApps.ts`. */
import { ThreadId, forwardCompatibleLiteral } from "../common.ts";
import { Defect, taggedError } from "./shared.ts";

export const McpAppRequestErrorReason = forwardCompatibleLiteral([
  "not-an-app",
  "provider-unsupported",
  "session-stopped",
  "tool-not-callable",
  "unsupported-content",
  "request-failed",
]);
export const McpAppRequestError = taggedError("McpAppRequestError", {
  threadId: ThreadId,
  reason: McpAppRequestErrorReason,
  cause: Defect.optional(),
});
