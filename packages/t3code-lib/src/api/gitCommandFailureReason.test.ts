// ---
// relationships:
//   verifies: library-facades
// ---
import { afterEach, beforeEach, expect, expectTypeOf, it } from "vite-plus/test";
import type { z } from "zod";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { T3RpcError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import type { KnownOr } from "../schemas/common.ts";
import { RpcErrorRecord, decodeRpcErrorRecord, type RpcErrorOfTag } from "../schemas/rpcErrors.ts";
import { GitCommandError } from "../schemas/rpcErrors/vcs.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { VcsApi } from "./vcs.ts";

const known = [
  "authentication_failed",
  "branch_already_exists",
  "branch_checked_out_in_worktree",
  "host_key_unverified",
  "not_a_repository",
  "path_already_exists",
  "push_rejected_by_remote",
  "push_rejected_non_fast_forward",
  "ref_not_found",
  "remote_unreachable",
  "tag_would_be_clobbered",
] as const;
type Reason = KnownOr<(typeof known)[number]>;
const failure = {
  _tag: "GitCommandError",
  operation: "createRef",
  command: "git branch",
  cwd: "/work/sample",
  exitCode: 128,
  detail: "Git command exited with a non-zero status.",
  future: { retained: true },
};
const invalid = [null, 12, true, {}, []];
let server: FakeT3Server;
let connection: RpcConnection;
let vcs: VcsApi;
beforeEach(async () => {
  server = await FakeT3Server.start();
  connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
  vcs = new VcsApi(new RpcClient(connection, rpcMethods));
});
afterEach(async () => {
  await connection.close();
  await server.close();
});
const rejection = async (error: Record<string, unknown>): Promise<T3RpcError> => {
  server.handle("vcs.createRef", () => ({
    kind: "fail",
    error: error as { _tag: string } & Record<string, unknown>,
  }));
  const caught = await vcs.createRef({ cwd: "/work/sample", refName: "sample" }).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(caught instanceof T3RpcError)) throw new Error("expected a T3RpcError");
  return caught;
};
it("types optional Git failure reasons as a growing literal set", () => {
  expectTypeOf<z.infer<typeof GitCommandError>["reason"]>().toEqualTypeOf<Reason | undefined>();
  expectTypeOf<RpcErrorOfTag<"GitCommandError">["reason"]>().toEqualTypeOf<Reason | undefined>();
  for (const reason of [...known, "future_reason"])
    expect(GitCommandError.parse({ ...failure, reason })).toEqual({ ...failure, reason });
});
it("preserves omission and unknown failure metadata", () => {
  const parsed = GitCommandError.parse(failure);
  expect(parsed).toEqual(failure);
  expect(Object.hasOwn(parsed, "reason")).toBe(false);
});
it("rejects non-string reasons with otherwise valid failures", () => {
  for (const reason of invalid) {
    expect(GitCommandError.safeParse({ ...failure, reason }).success).toBe(false);
    expect(RpcErrorRecord.safeParse({ ...failure, reason }).success).toBe(false);
    expect(decodeRpcErrorRecord({ ...failure, reason })).toEqual({
      unknown: true,
      raw: { ...failure, reason },
    });
  }
});
it("exposes reasons on rejected VCS calls through the typed record", async () => {
  for (const reason of ["branch_already_exists", "ref_not_found", "future_reason"]) {
    const error = await rejection({ ...failure, reason });
    expect(error.is("GitCommandError")).toBe(true);
    if (!error.is("GitCommandError")) throw new Error("expected a known record");
    expect(error.record.reason).toBe(reason);
    expect(error.record).toEqual({ ...failure, reason });
  }
  const omitted = await rejection(failure);
  if (!omitted.is("GitCommandError")) throw new Error("expected a known record");
  expect(Object.hasOwn(omitted.record, "reason")).toBe(false);
});
it("keeps the raw failure when a rejected VCS call carries a malformed reason", async () => {
  for (const reason of invalid) {
    const error = await rejection({ ...failure, reason });
    expect(error.is("GitCommandError")).toBe(false);
    expect(error.tag).toBe("GitCommandError");
    expect(error.record).toEqual({ unknown: true, raw: { ...failure, reason } });
    expect(error.detail).toEqual({ ...failure, reason });
  }
});
