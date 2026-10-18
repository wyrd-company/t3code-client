// ---
// relationships:
//   implements: mcp
// ---
/** One deadline for server acquisition, credential loading and probes. */
export const SERVER_DEADLINE_MS = 5000;

/** Stop waiting on non-cancellable library I/O, observing its eventual rejection. */
export function withSignal<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const finish = () => signal.removeEventListener("abort", abort);
    void pending.then(
      (value) => {
        finish();
        resolve(value);
      },
      (error: unknown) => {
        finish();
        reject(error);
      },
    );
    if (signal.aborted) {
      finish();
      abort();
    }
  });
}
