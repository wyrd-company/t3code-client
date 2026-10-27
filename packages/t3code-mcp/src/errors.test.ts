// ---
// relationships:
//   verifies: mcp
// ---
import { expect, it } from "vite-plus/test";
import { T3HttpError, T3StorageError, T3AuthError } from "@wyrd-company/t3code-lib";
import { safeError } from "./errors.ts";

it("withholds upstream bodies, parser causes and credential-bearing exception text", () => {
  const text = "Bearer sample-secret, webhook body sample-body";
  for (const error of [
    new Error(text),
    new T3StorageError(text),
    new T3HttpError(text, { status: 500, method: "GET", path: text, body: text }),
  ]) {
    const result = safeError(error);
    expect(JSON.stringify(result)).not.toContain("sample-secret");
    expect(JSON.stringify(result)).not.toContain("sample-body");
    expect(result.code).toBeTruthy();
  }
});

it("preserves missing-permission classification without echoing the server message", () => {
  const error = T3AuthError.insufficientScope("diagnostics:read", "sample");
  expect(safeError(error)).toMatchObject({ code: "insufficient_scope" });
});
