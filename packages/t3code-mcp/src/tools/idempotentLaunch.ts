// ---
// relationships:
//   implements: mcp
// ---
import type { ThreadLaunchInput } from "@wyrd-company/t3code-lib";
import type { Registry, ServerClient } from "../servers/registry.ts";
import { projectionView } from "../views/thread.ts";
// Serialize concurrent retries in this MCP session. The server owns the
// persistent identity; this map contains only in-flight operations.
const launches = new WeakMap<Registry, Map<string, Promise<void>>>();
export async function launchOnce(
  registry: Registry,
  server: string,
  client: ServerClient,
  input: ThreadLaunchInput,
  signal: AbortSignal,
): Promise<object> {
  if (input.threadId === undefined) {
    const result = await client.threads.launch(input, signal);
    return { ...projectionView(server, result.projection), resumed: result.resumed };
  }
  const key = JSON.stringify([server, input.threadId]);
  let pending = launches.get(registry);
  if (!pending) {
    pending = new Map();
    launches.set(registry, pending);
  }
  const previous = pending.get(key);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  pending.set(key, gate);
  try {
    await previous;
    signal.throwIfAborted();
    if (await client.threads.get(input.threadId, signal)) {
      return {
        ...projectionView(server, (await client.threads.detail(input.threadId, signal)).projection),
        resumed: true,
      };
    }
    // Upstream reuseExistingThread claims an existing EMPTY thread; it is not
    // an upsert and cannot replay an initial message. Create with our stable id.
    try {
      const result = await client.threads.launch(input, signal);
      return { ...projectionView(server, result.projection), resumed: result.resumed };
    } catch (error) {
      if (signal.aborted) throw error;
      // Another MCP session can win the create, or the launch receipt can be
      // lost. Recover only the persisted identity; never dispatch a second message.
      const existing = await client.threads.get(input.threadId, signal).catch(() => undefined);
      if (!existing) throw error;
      return {
        ...projectionView(server, (await client.threads.detail(input.threadId, signal)).projection),
        resumed: true,
      };
    }
  } finally {
    release();
    if (pending.get(key) === gate) pending.delete(key);
  }
}
