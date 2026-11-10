// ---
// relationships:
//   implements: mcp
// ---
import { T3Error, T3RpcError, type T3ErrorCode } from "@wyrd-company/t3code-lib";
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

/** A tool-level refusal with a stable code and fixed text. */
export class ToolRefusal extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolRefusal";
    this.code = code;
  }
}

/**
 * Awaits `operation`. When it fails with an upstream RPC error that `refuse`
 * maps to a refusal, throws that refusal; other failures pass through.
 */
export async function refuseRpcError<T>(
  operation: Promise<T>,
  refuse: (error: T3RpcError) => ToolRefusal | undefined,
): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    const refusal = error instanceof T3RpcError ? refuse(error) : undefined;
    throw refusal ?? error;
  }
}

/** Error text is fixed so upstream response bodies and credentials cannot enter diagnostics. */
export function safeError(error: unknown): { code: string; message: string } {
  if (error instanceof z.ZodError)
    return { code: "invalid_input", message: "Arguments do not match the tool schema." };
  if (error instanceof ToolRefusal) return { code: error.code, message: error.message };
  if (error instanceof T3Error) return { code: error.code, message: messages[error.code] };
  return { code: "upstream_error", message: "The upstream operation failed." };
}
