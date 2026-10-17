/**
 * Tagged failures of the terminal RPC methods, mirroring the contracts'
 * `terminal.ts`.
 */
import { z } from "zod";
import { forwardCompatibleLiteral } from "../common.ts";
import { TerminalColsSchema, TerminalRowsSchema } from "../terminal.ts";
import { Defect, taggedError } from "./shared.ts";

const terminalRef = { threadId: z.string(), terminalId: z.string() };
export const TerminalCwdNotFoundError = taggedError("TerminalCwdNotFoundError", {
  cwd: z.string(),
});
export const TerminalCwdNotDirectoryError = taggedError("TerminalCwdNotDirectoryError", {
  cwd: z.string(),
});
export const TerminalCwdStatError = taggedError("TerminalCwdStatError", {
  cwd: z.string(),
  cause: Defect,
});
export const TerminalHistoryError = taggedError("TerminalHistoryError", {
  operation: forwardCompatibleLiteral(["read", "truncate", "migrate"]),
  ...terminalRef,
  cause: Defect.optional(),
});
export const TerminalSessionLookupError = taggedError("TerminalSessionLookupError", terminalRef);
export const TerminalProviderInstanceNotFoundError = taggedError(
  "TerminalProviderInstanceNotFoundError",
  { providerInstanceId: z.string() },
);
export const TerminalProviderEnvironmentError = taggedError("TerminalProviderEnvironmentError", {
  providerInstanceId: z.string(),
  cause: Defect,
});
export const TerminalNotRunningError = taggedError("TerminalNotRunningError", terminalRef);
export const TerminalWriteError = taggedError("TerminalWriteError", {
  ...terminalRef,
  terminalPid: z.number(),
  cause: Defect,
});
export const TerminalResizeError = taggedError("TerminalResizeError", {
  ...terminalRef,
  terminalPid: z.number(),
  cols: TerminalColsSchema,
  rows: TerminalRowsSchema,
  cause: Defect,
});
