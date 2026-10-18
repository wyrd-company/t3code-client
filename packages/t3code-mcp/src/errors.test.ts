// ---
// relationships:
//   verifies: mcp
// ---
import { expect, it } from "vite-plus/test";
import {
  T3AuthError,
  T3ConnectionError,
  T3NotFoundError,
  T3PreconditionError,
  T3RpcError,
} from "@wyrd-company/t3code-lib";
import { z } from "zod";
import { ToolError, toToolError, redactMessage } from "./errors.ts";
it("maps library errors to stable tool codes and withholds unknown exception text", () => {
  const details = { status: 404, method: "GET", path: "/sample", body: undefined };
  expect(toToolError(new T3NotFoundError("Missing resource", details)).code).toBe("not_found");
  expect(
    toToolError(
      new T3AuthError("Invalid credential", { ...details, status: 401, code: "auth_invalid" }),
    ).code,
  ).toBe("auth_invalid");
  expect(toToolError(new T3ConnectionError("open_failed", "Unavailable")).code).toBe(
    "server_unreachable",
  );
  expect(toToolError(new T3PreconditionError("Invalid state")).code).toBe("invalid_state");
  expect(
    toToolError(new T3RpcError("sample", { _tag: "unknown", message: "Sample failure" })).code,
  ).toBe("upstream_error");
  expect(toToolError(new Error("sample-private-value")).message).not.toContain(
    "sample-private-value",
  );
  const invalid = z.string().safeParse(42);
  if (invalid.success) throw new Error("Invalid fixture");
  expect(toToolError(invalid.error).code).toBe("invalid_input");
  const own = new ToolError("tool_denied", "Denied");
  expect(toToolError(own)).toBe(own);
});

it("redacts overlapping configured tokens and credential-shaped assignments", () => {
  expect(
    redactMessage(
      'sample-long-token sample-long {"token":"sample-json"} password=sample-password Authorization: Bearer sample-bearer',
      ["sample-long", "sample-long-token"],
    ),
  ).toBe(
    '[redacted] [redacted] {"token":[redacted]} password=[redacted] Authorization: [redacted] [redacted]',
  );
});
