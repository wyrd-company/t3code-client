/**
 * Thread reads: shell lookups that fall back to the archived shell, and the
 * HTTP detail, history page, and transcript routes. ThreadsApi exposes them.
 */
import type { RpcClient } from "../rpc/client.ts";
import type { RpcMethods } from "../rpc/registry.ts";
import type { ProjectId, ThreadId } from "../schemas/common.ts";
import {
  OrchestrationV2ThreadDetailSnapshot,
  OrchestrationV2ThreadHistoryPage,
  OrchestrationV2ThreadTranscript,
} from "../schemas/orchestration/projection.ts";
import type { OrchestrationV2ThreadShell } from "../schemas/orchestration/shell.ts";
import type { HttpTransport } from "../transport/http.ts";
import { loadShellSnapshot, orchestrationHttpHeaders } from "./shell.ts";

export interface ThreadListOptions {
  readonly projectId?: ProjectId;
  readonly includeArchived?: boolean;
}

export interface ThreadHistoryPageOptions {
  readonly throughEntryId?: string;
  readonly view?: "conversation" | "activity";
}

/**
 * Active threads from the shell; with `includeArchived`, archived threads
 * as well. The HTTP shell lists only active threads, so archived ones come
 * from the archived shell over RPC.
 */
export async function listThreads(
  http: HttpTransport,
  rpc: RpcClient<RpcMethods>,
  options: ThreadListOptions,
  signal?: AbortSignal,
): Promise<OrchestrationV2ThreadShell[]> {
  const shell = await loadShellSnapshot(http, signal);
  const threads = [...shell.threads];
  if (options.includeArchived) {
    const known = new Set(threads.map((thread) => thread.id));
    for (const thread of await archivedThreads(rpc, shell, signal)) {
      if (!known.has(thread.id)) threads.push(thread);
    }
  }
  return options.projectId === undefined
    ? threads
    : threads.filter((thread) => thread.projectId === options.projectId);
}

/** Active threads first; archived threads are consulted only when the id is not active. */
export async function findThread(
  http: HttpTransport,
  rpc: RpcClient<RpcMethods>,
  threadId: ThreadId,
  signal?: AbortSignal,
): Promise<OrchestrationV2ThreadShell | undefined> {
  const shell = await loadShellSnapshot(http, signal);
  const active = shell.threads.find((thread) => thread.id === threadId);
  if (active) return active;
  return (await archivedThreads(rpc, shell, signal)).find((thread) => thread.id === threadId);
}

async function archivedThreads(
  rpc: RpcClient<RpcMethods>,
  shell: { readonly archivedThreads: readonly OrchestrationV2ThreadShell[] },
  signal?: AbortSignal,
): Promise<OrchestrationV2ThreadShell[]> {
  if (shell.archivedThreads.length > 0) return [...shell.archivedThreads];
  const archived = await rpc.call("orchestration.getArchivedShellSnapshot", {}, signal);
  return [...archived.threads];
}

export function loadThreadDetail(
  http: HttpTransport,
  threadId: ThreadId,
  signal?: AbortSignal,
): Promise<OrchestrationV2ThreadDetailSnapshot> {
  return http.request({
    method: "GET",
    path: threadPath(threadId),
    auth: "required",
    headers: orchestrationHttpHeaders,
    decode: OrchestrationV2ThreadDetailSnapshot,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function loadThreadHistoryPage(
  http: HttpTransport,
  threadId: ThreadId,
  cursor: string,
  options: ThreadHistoryPageOptions,
  signal?: AbortSignal,
): Promise<OrchestrationV2ThreadHistoryPage> {
  return http.request({
    method: "GET",
    path: `${threadPath(threadId)}/history`,
    query: { cursor, ...options },
    auth: "required",
    headers: orchestrationHttpHeaders,
    decode: OrchestrationV2ThreadHistoryPage,
    ...(signal === undefined ? {} : { signal }),
  });
}

export function loadThreadTranscript(
  http: HttpTransport,
  threadId: ThreadId,
  signal?: AbortSignal,
): Promise<OrchestrationV2ThreadTranscript> {
  return http.request({
    method: "GET",
    path: `${threadPath(threadId)}/transcript`,
    auth: "required",
    headers: orchestrationHttpHeaders,
    decode: OrchestrationV2ThreadTranscript,
    ...(signal === undefined ? {} : { signal }),
  });
}

function threadPath(threadId: ThreadId): string {
  return `/api/orchestration/threads/${encodeURIComponent(threadId)}`;
}
