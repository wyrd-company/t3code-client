// ---
// relationships:
//   implements: mcp
// ---
import { T3Error, T3RpcError } from "@wyrd-company/t3code-lib";
import { z } from "zod";
export type ToolErrorCode =
  | "invalid_input"
  | "server_required"
  | "server_unknown"
  | "server_unreachable"
  | "auth_invalid"
  | "not_found"
  | "invalid_state"
  | "tool_denied"
  | "runtime_mode_denied"
  | "upstream_error";
export class ToolError extends Error {
  readonly code: ToolErrorCode;
  constructor(code: ToolErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
/** Unknown exception text is withheld; library exceptions have already been redacted. */
export function toToolError(error: unknown): ToolError {
  if (error instanceof ToolError) return error;
  if (error instanceof z.ZodError)
    return new ToolError("invalid_input", "Arguments do not match the tool schema.");
  if (error instanceof T3Error) {
    const code: ToolErrorCode =
      error.code === "auth_invalid"
        ? "auth_invalid"
        : error.code === "not_found"
          ? "not_found"
          : error.code === "connection"
            ? "server_unreachable"
            : error.code === "precondition"
              ? "invalid_state"
              : "upstream_error";
    if (error instanceof T3RpcError && error.is("OrchestrationV2DispatchCommandError"))
      return new ToolError("invalid_state", error.message);
    return new ToolError(code, error.message);
  }
  return new ToolError("upstream_error", "The upstream operation failed.");
}
