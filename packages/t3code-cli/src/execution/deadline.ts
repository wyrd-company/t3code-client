// ---
// relationships:
//   implements: output-contract
// ---
/** Node clamps larger timer delays to one millisecond; preserve long durations. */
export function invocationDeadline(
  startedAt: number,
  timeoutMs: number,
  expired: () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout>;
  function schedule() {
    const remaining = timeoutMs - (Date.now() - startedAt);
    timer = setTimeout(
      () => {
        if (Date.now() - startedAt >= timeoutMs) expired();
        else schedule();
      },
      Math.max(0, Math.min(remaining, 2_147_483_647)),
    );
  }
  schedule();
  return () => clearTimeout(timer);
}
