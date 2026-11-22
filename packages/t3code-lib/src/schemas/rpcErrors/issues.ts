import { z } from "zod";
import { TrimmedNonEmptyString, forwardCompatibleLiteral } from "../common.ts";
import { IssueTrackerKind } from "../issueRecords.ts";
import { Defect, taggedError } from "./shared.ts";

export const IssueUnavailableError = taggedError("IssueUnavailableError", {
  reason: forwardCompatibleLiteral(["tool-missing", "unauthenticated", "tracker-unsupported"]),
  tracker: IssueTrackerKind.optional(),
  cause: Defect.optional(),
});

export const IssueOperationError = taggedError("IssueOperationError", {
  operation: z.string(),
  detail: TrimmedNonEmptyString,
  reason: forwardCompatibleLiteral(["not-found", "read-only", "rate-limited"]).optional(),
  retryAt: z.number().optional(),
  cause: Defect.optional(),
});

export const IssueTrackerConnectionError = taggedError("IssueTrackerConnectionError", {
  tracker: IssueTrackerKind,
  reason: forwardCompatibleLiteral(["unknown-tracker", "rejected", "failed"]),
  detail: TrimmedNonEmptyString,
  cause: Defect.optional(),
});

export const issueRpcErrors = [
  IssueUnavailableError,
  IssueOperationError,
  IssueTrackerConnectionError,
] as const;
