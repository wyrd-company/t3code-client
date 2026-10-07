import { describe, expect, it } from "vite-plus/test";

import { EnvironmentHttpCommonError, EnvironmentScopeRequiredError } from "./httpErrors.ts";

describe("HTTP error schemas", () => {
  it("discriminates tagged environment errors", () => {
    expect(
      EnvironmentHttpCommonError.parse({
        _tag: "EnvironmentScopeRequiredError",
        code: "insufficient_scope",
        requiredScope: "orchestration:operate",
        traceId: "trace-1",
      }),
    ).toMatchObject({ code: "insufficient_scope" });
    expect(
      EnvironmentHttpCommonError.safeParse({ _tag: "EnvironmentFutureError", traceId: "t" })
        .success,
    ).toBe(false);
  });
  it("carries the granular permission beside its legacy parent scope", () => {
    const denied = EnvironmentScopeRequiredError.parse({
      _tag: "EnvironmentScopeRequiredError",
      code: "insufficient_scope",
      requiredScope: "orchestration:operate",
      requiredPermission: "filesystem:write",
      traceId: "trace-1",
    });
    expect(denied.requiredPermission).toBe("filesystem:write");
    expect(
      EnvironmentScopeRequiredError.parse({
        _tag: "EnvironmentScopeRequiredError",
        code: "insufficient_scope",
        requiredScope: "future:scope",
        traceId: "trace-1",
      }).requiredScope,
    ).toBe("future:scope");
  });
  it("decodes the request, auth, forbidden, and not-found reasons", () => {
    const invalid = (reason: string) =>
      EnvironmentHttpCommonError.parse({
        _tag: "EnvironmentRequestInvalidError",
        code: "invalid_request",
        reason,
        traceId: "trace-1",
      });
    expect(invalid("invalid_history_cursor")).toMatchObject({ reason: "invalid_history_cursor" });
    expect(invalid("invalid_command")).toMatchObject({ reason: "invalid_command" });
    expect(invalid("future_reason")).toMatchObject({ reason: "future_reason" });
    expect(
      EnvironmentHttpCommonError.parse({
        _tag: "EnvironmentAuthInvalidError",
        code: "auth_invalid",
        reason: "invalid_credential",
        dpopFailureReason: "replay",
        traceId: "trace-1",
      }),
    ).toMatchObject({ dpopFailureReason: "replay" });
    expect(
      EnvironmentHttpCommonError.parse({
        _tag: "EnvironmentOperationForbiddenError",
        code: "operation_forbidden",
        reason: "current_session_revoke_not_allowed",
        traceId: "trace-1",
      }),
    ).toMatchObject({ code: "operation_forbidden" });
    expect(
      EnvironmentHttpCommonError.parse({
        _tag: "EnvironmentResourceNotFoundError",
        code: "not_found",
        reason: "thread_not_found",
        traceId: "trace-1",
      }),
    ).toMatchObject({ reason: "thread_not_found" });
  });
  it("decodes the internal error reasons, known and future", () => {
    const internal = (reason: string) =>
      EnvironmentHttpCommonError.parse({
        _tag: "EnvironmentInternalError",
        code: "internal_error",
        reason,
        traceId: "trace-1",
      });
    for (const reason of [
      "project_mutation_failed",
      "orchestration_thread_bounded_snapshot_failed",
      "orchestration_thread_history_failed",
      "future_failed",
    ]) {
      expect(internal(reason), reason).toMatchObject({ reason });
    }
  });
  it("fails a known tag with a mismatched code or missing trace", () => {
    expect(
      EnvironmentHttpCommonError.safeParse({
        _tag: "EnvironmentAuthInvalidError",
        code: "insufficient_scope",
        reason: "missing_credential",
        traceId: "trace-1",
      }).success,
    ).toBe(false);
    expect(
      EnvironmentHttpCommonError.safeParse({
        _tag: "EnvironmentResourceNotFoundError",
        code: "not_found",
        reason: "thread_not_found",
      }).success,
    ).toBe(false);
  });
});
