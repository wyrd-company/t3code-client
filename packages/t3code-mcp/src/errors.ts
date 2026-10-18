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
/** Redact exact configured credentials and credential-shaped values in upstream text. */
export function redactMessage(message: string, tokens: readonly string[]): string {
  let safe = message;
  for (const token of [...tokens].filter(Boolean).sort((a, b) => b.length - a.length))
    safe = safe.replaceAll(token, "[redacted]");
  return safe
    .replace(/\bBearer\s+[^\s"'<>;,]+/gi, "Bearer [redacted]")
    .replace(
      /\b((?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|secret|password|credential|authorization)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi,
      "$1[redacted]",
    );
}
/** Unknown exception text is withheld; every forwarded message is redacted locally. */
export function toToolError(error: unknown, tokens: readonly string[] = []): ToolError {
  if (error instanceof ToolError) {
    const message = redactMessage(error.message, tokens);
    return message === error.message ? error : new ToolError(error.code, message);
  }
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
      return new ToolError("invalid_state", redactMessage(error.message, tokens));
    return new ToolError(code, redactMessage(error.message, tokens));
  }
  return new ToolError("upstream_error", "The upstream operation failed.");
}
