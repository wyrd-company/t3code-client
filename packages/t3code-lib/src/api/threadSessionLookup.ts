// ---
// relationships:
//   implements: library-facades
// ---
import { T3PreconditionError } from "../errors.ts";
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import { ProviderInstanceId, TrimmedNonEmptyString, type ThreadId } from "../schemas/common.ts";
import type { HttpTransport } from "../transport/http.ts";
import { listThreads } from "./threadReads.ts";

/** Find the owning app thread across current and historical provider threads. */
export async function findThreadByNativeSession(
  http: HttpTransport,
  rpc: RpcClient<RpcMethods>,
  providerInstanceId: ProviderInstanceId,
  nativeSessionId: string,
  signal?: AbortSignal,
): Promise<ThreadId | null> {
  const provider = ProviderInstanceId.safeParse(providerInstanceId);
  const session = TrimmedNonEmptyString.safeParse(nativeSessionId);
  if (!provider.success || !session.success) {
    throw new T3PreconditionError(
      "A valid provider instance id and nonempty native session id are required.",
    );
  }
  const threads = await listThreads(http, rpc, { includeArchived: true }, signal);
  let found: ThreadId | null = null;
  for (const thread of threads) {
    if (thread.deletedAt !== null) continue;
    const projection = await rpc.call(
      "orchestration.getThreadProjection",
      { threadId: thread.id },
      signal,
    );
    if (projection.thread.deletedAt !== null) continue;
    const matches = projection.providerThreads.some(
      (candidate) =>
        candidate.appThreadId === thread.id &&
        candidate.providerInstanceId === provider.data &&
        candidate.nativeThreadRef?.nativeId === session.data,
    );
    if (!matches) continue;
    if (found !== null && found !== thread.id) {
      throw new T3PreconditionError("The native session matches more than one T3 Code thread.");
    }
    found = thread.id;
  }
  return found;
}
