import { z } from "zod";

import { AuthGrantedScope } from "./auth.ts";
import { TrimmedNonEmptyString, forwardCompatibleLiteral } from "./common.ts";

export const EnvironmentRequestInvalidError = z.looseObject({
  _tag: z.literal("EnvironmentRequestInvalidError"),
  code: z.literal("invalid_request"),
  reason: forwardCompatibleLiteral([
    "invalid_scope",
    "scope_not_granted",
    "invalid_command",
    "invalid_history_cursor",
    "thread_transcript_too_large",
  ]),
  traceId: TrimmedNonEmptyString,
});
export type EnvironmentRequestInvalidError = z.infer<typeof EnvironmentRequestInvalidError>;

export const EnvironmentAuthInvalidError = z.looseObject({
  _tag: z.literal("EnvironmentAuthInvalidError"),
  code: z.literal("auth_invalid"),
  reason: z.enum(["missing_credential", "invalid_credential"]),
  dpopFailureReason: z
    .enum([
      "time_window",
      "key_mismatch",
      "request_mismatch",
      "token_mismatch",
      "replay",
      "invalid_proof",
    ])
    .optional(),
  traceId: TrimmedNonEmptyString,
});
export type EnvironmentAuthInvalidError = z.infer<typeof EnvironmentAuthInvalidError>;

export const EnvironmentScopeRequiredError = z.looseObject({
  _tag: z.literal("EnvironmentScopeRequiredError"),
  code: z.literal("insufficient_scope"),
  /** The legacy parent of `requiredPermission`, so older clients can decode the denial. */
  requiredScope: AuthGrantedScope,
  /** The scope the request actually needs. */
  requiredPermission: z.string().optional(),
  traceId: TrimmedNonEmptyString,
});
export type EnvironmentScopeRequiredError = z.infer<typeof EnvironmentScopeRequiredError>;

export const EnvironmentOperationForbiddenError = z.looseObject({
  _tag: z.literal("EnvironmentOperationForbiddenError"),
  code: z.literal("operation_forbidden"),
  reason: z.literal("current_session_revoke_not_allowed"),
  traceId: TrimmedNonEmptyString,
});
export type EnvironmentOperationForbiddenError = z.infer<typeof EnvironmentOperationForbiddenError>;

export const EnvironmentResourceNotFoundError = z.looseObject({
  _tag: z.literal("EnvironmentResourceNotFoundError"),
  code: z.literal("not_found"),
  reason: z.literal("thread_not_found"),
  traceId: TrimmedNonEmptyString,
});
export type EnvironmentResourceNotFoundError = z.infer<typeof EnvironmentResourceNotFoundError>;

export const EnvironmentInternalError = z.looseObject({
  _tag: z.literal("EnvironmentInternalError"),
  code: z.literal("internal_error"),
  reason: forwardCompatibleLiteral([
    "bootstrap_validation_failed",
    "browser_session_issuance_failed",
    "browser_session_cookie_failed",
    "access_token_issuance_failed",
    "websocket_ticket_issuance_failed",
    "pairing_credential_issuance_failed",
    "pairing_links_load_failed",
    "pairing_link_revoke_failed",
    "client_sessions_load_failed",
    "client_session_revoke_failed",
    "project_snapshot_failed",
    "project_mutation_failed",
    "orchestration_snapshot_failed",
    "orchestration_thread_snapshot_failed",
    "orchestration_thread_bounded_snapshot_failed",
    "orchestration_thread_history_failed",
    "internal_error",
  ]),
  traceId: TrimmedNonEmptyString,
});
export type EnvironmentInternalError = z.infer<typeof EnvironmentInternalError>;

export const EnvironmentHttpCommonError = z.discriminatedUnion("_tag", [
  EnvironmentRequestInvalidError,
  EnvironmentAuthInvalidError,
  EnvironmentScopeRequiredError,
  EnvironmentOperationForbiddenError,
  EnvironmentResourceNotFoundError,
  EnvironmentInternalError,
]);
export type EnvironmentHttpCommonError = z.infer<typeof EnvironmentHttpCommonError>;

/**
 * The failures of the `/api/connect` and `/api/t3-connect` routes. Each carries a `message`, and
 * the status tells them apart: 400, 401, 403, 409 and 500.
 */
const cloudLinkFailure = <const Tag extends string>(tag: Tag) =>
  z.looseObject({ _tag: z.literal(tag), message: z.string() });

export const EnvironmentHttpBadRequestError = cloudLinkFailure("EnvironmentHttpBadRequestError");
export const EnvironmentHttpUnauthorizedError = cloudLinkFailure(
  "EnvironmentHttpUnauthorizedError",
);
export const EnvironmentHttpForbiddenError = cloudLinkFailure("EnvironmentHttpForbiddenError");
export const EnvironmentHttpConflictError = cloudLinkFailure("EnvironmentHttpConflictError");
export const EnvironmentHttpInternalServerError = cloudLinkFailure(
  "EnvironmentHttpInternalServerError",
);
/** A 503: the server could not start the tunnel that the relay configuration asks for. */
export const EnvironmentCloudEndpointUnavailableError = z.looseObject({
  _tag: z.literal("EnvironmentCloudEndpointUnavailableError"),
  message: z.string(),
  endpointRuntimeStatus: z.unknown(),
});

export const EnvironmentHttpCloudError = z.discriminatedUnion("_tag", [
  EnvironmentHttpBadRequestError,
  EnvironmentHttpUnauthorizedError,
  EnvironmentHttpForbiddenError,
  EnvironmentHttpConflictError,
  EnvironmentHttpInternalServerError,
  EnvironmentCloudEndpointUnavailableError,
  EnvironmentScopeRequiredError,
]);
export type EnvironmentHttpCloudError = z.infer<typeof EnvironmentHttpCloudError>;
