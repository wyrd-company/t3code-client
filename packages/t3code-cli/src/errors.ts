// ---
// relationships:
//   implements: command-line
// ---
import {
  T3AuthError,
  T3Error,
  T3ConnectionError,
  T3InterruptedError,
  T3NotFoundError,
  T3PreconditionError,
  T3RpcError,
  T3TimeoutError,
} from "@wyrd-company/t3code-lib";

export class UnimplementedCommandError extends Error {}

export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type ErrorContext = "local" | "connection" | "dispatch" | "run-detach" | "run-interrupt";
export interface CliFailure {
  code: string;
  message: string;
  requiredScope?: string;
}

/** Context describes the operation that failed, never inferred from error prose. */
export function exitCodeFor(error: unknown, context: ErrorContext = "connection"): ExitCode {
  if (error instanceof T3Error && error.code === "storage") return 1;
  if (error instanceof T3PreconditionError) return 2;
  if (error instanceof T3AuthError) return 9;
  if (error instanceof T3NotFoundError) return 10;
  if (error instanceof T3InterruptedError) return 4;
  if (error instanceof T3ConnectionError) return 8;
  if (error instanceof T3TimeoutError) {
    if (context === "run-detach") return 5;
    if (context === "run-interrupt") return 6;
    return context === "local" ? 1 : 8;
  }
  if (error instanceof T3RpcError) {
    if (error.is("EnvironmentAuthorizationError")) return 9;
    if (error.is("TerminalProviderInstanceNotFoundError")) return 10;
    // Unclassified dispatch refusal is not evidence of a failed run.
  }
  return 1;
}

export function exitCodeForState(state: string): ExitCode {
  switch (state) {
    case "completed":
    case "idle":
      return 0;
    case "failed":
    case "rolled_back":
      return 3;
    case "interrupted":
    case "cancelled":
      return 4;
    default:
      return 1;
  }
}

/** Fixed diagnostic prose prevents raw server, file and token input disclosure. */
export function failureFor(error: unknown, context: ErrorContext = "connection"): CliFailure {
  const exitCode = exitCodeFor(error, context);
  const messages: Record<number, string> = {
    1: "Command failed.",
    2: "Invalid command input or profile selection.",
    4: "Operation interrupted.",
    5: "Timed out; run remains active.",
    6: "Timed out; interruption requested.",
    8: "Server connection failed.",
    9: "Credential rejected or required scope missing.",
    10: "Selected resource not found.",
  };
  return {
    code:
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : "unexpected",
    message:
      error instanceof UnimplementedCommandError
        ? "Command implementation pending."
        : (messages[exitCode] ?? "Command failed."),
    ...(error instanceof T3AuthError && error.requiredScope !== undefined
      ? { requiredScope: error.requiredScope }
      : {}),
  };
}
