// ---
// relationships:
//   implements: mcp
// ---
import { threadId, type OrchestrationV2ThreadShell } from "@wyrd-company/t3code-lib";
import type { ServerClient } from "../servers/registry.ts";
import { ToolError } from "../errors.ts";
/** Missing resources have one tool code, independent of the upstream RPC route. */
export async function requireThread(
  client: ServerClient,
  id: string,
  signal: AbortSignal,
): Promise<OrchestrationV2ThreadShell> {
  const thread = await client.threads.get(threadId(id), signal);
  if (!thread) throw new ToolError("not_found", "Thread does not exist.");
  return thread;
}
