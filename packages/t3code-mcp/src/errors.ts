// ---
// relationships:
//   implements: mcp
// ---
import { T3Error, type T3ErrorCode } from "@wyrd-company/t3code-lib";
import { z } from "zod";

const messages: Readonly<Record<T3ErrorCode, string>> = {
  auth_invalid: "Authentication failed.",
  insufficient_scope: "The selected credential lacks the required permission.",
  connection: "The selected T3 Code server could not be reached.",
  decode: "The operation returned data that could not be decoded.",
  http: "The upstream HTTP operation failed.",
  interrupted: "The operation was cancelled.",
  not_found: "The selected resource does not exist.",
  precondition: "The operation's inputs or current state do not permit this request.",
  rpc_failed: "The upstream RPC operation failed.",
  rpc_defect: "The upstream RPC operation could not complete.",
  storage: "The connection configuration or credential store could not be accessed.",
  timeout: "The upstream operation exceeded its deadline.",
};

/** Error text is fixed so upstream response bodies and credentials cannot enter diagnostics. */
export function safeError(error: unknown): { code: string; message: string } {
  if (error instanceof z.ZodError)
    return { code: "invalid_input", message: "Arguments do not match the tool schema." };
  if (error instanceof T3Error) return { code: error.code, message: messages[error.code] };
  return { code: "upstream_error", message: "The upstream operation failed." };
}
