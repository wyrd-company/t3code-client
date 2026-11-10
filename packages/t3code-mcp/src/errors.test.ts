// ---
// relationships:
//   verifies: mcp
// ---
import { expect, it } from "vite-plus/test";
import { T3HttpError, T3RpcError, T3StorageError, T3AuthError } from "@wyrd-company/t3code-lib";
import { ToolRefusal, refuseRpcError, safeError } from "./errors.ts";

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

it("maps a matching RPC error to a refusal and passes other failures through", async () => {
  const refusal = new ToolRefusal("sample_code", "Sample refusal.");
  const refuse = (error: T3RpcError) => (error.tag === "SampleError" ? refusal : undefined);
  const matching = new T3RpcError("sample.method", { _tag: "SampleError" });
  const other = new T3RpcError("sample.method", { _tag: "OtherError" });
  const plain = new Error("sample");
  await expect(refuseRpcError(Promise.resolve(1), refuse)).resolves.toBe(1);
  await expect(refuseRpcError(Promise.reject(matching), refuse)).rejects.toBe(refusal);
  await expect(refuseRpcError(Promise.reject(other), refuse)).rejects.toBe(other);
  await expect(refuseRpcError(Promise.reject(plain), refuse)).rejects.toBe(plain);
});
