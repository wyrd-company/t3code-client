// ---
// relationships:
//   verifies: command-line
// ---
import { vi } from "vite-plus/test";
import type { T3Client, ThreadWatchItem } from "@wyrd-company/t3code-lib";
import { makeProjection, makeRun, ids } from "../../t3code-lib/test/support/threadFixtures.ts";
import { createInvocation } from "../src/context.ts";
import { Output } from "../src/output.ts";
import { followPolicy } from "../src/execution/followPolicy.ts";
function channel() {
  const queue: ThreadWatchItem[] = [];
  let rejectNext: ((error: unknown) => void) | undefined;
  let waiting: ((value: IteratorResult<ThreadWatchItem>) => void) | undefined;
  const iterator: AsyncIterableIterator<ThreadWatchItem> = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next: () =>
      queue.length
        ? Promise.resolve({ value: queue.shift()!, done: false })
        : new Promise((resolve, reject) => {
            rejectNext = reject;
            waiting = resolve;
          }),
    return: async () => {
      waiting?.({ value: undefined, done: true });
      return { value: undefined, done: true };
    },
  };
  return {
    iterator,
    fail(error: unknown) {
      rejectNext?.(error);
    },
    push(value: ThreadWatchItem) {
      if (waiting) {
        const resolve = waiting;
        waiting = undefined;
        resolve({ value, done: false });
      } else queue.push(value);
    },
  };
}
export function setup(json = false, stream = false) {
  const stdout: string[] = [],
    stderr: string[] = [];
  const output = new Output(
    { stdout: (s) => stdout.push(s), stderr: (s) => stderr.push(s) },
    json,
    stream,
  );
  const invocation = createInvocation({}, output);
  invocation.errorContext = "connection";
  const feed = channel();
  const interrupt = vi.fn(async () => {}),
    respondToApproval = vi.fn(async () => {});
  const client = { threads: { watch: vi.fn(() => feed.iterator), interrupt, respondToApproval } };
  vi.spyOn(invocation, "client").mockResolvedValue(client as unknown as T3Client);
  const snapshot = (overrides: Record<string, unknown> = {}) =>
    feed.push({
      kind: "snapshot",
      snapshot: {
        snapshotSequence: 1,
        projection: makeProjection({ runs: [makeRun()], ...overrides }),
      },
    });
  return {
    invocation,
    feed,
    snapshot,
    stdout,
    stderr,
    output,
    interrupt,
    respondToApproval,
    client,
  };
}
export const target = { threadId: ids.threadId };
export const policy = followPolicy({}, "detach");
export const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
