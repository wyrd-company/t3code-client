// ---
// relationships:
//   implements: output-contract
// ---
import { T3InterruptedError } from "@wyrd-company/t3code-lib";
import type { Output } from "../output.ts";

export type SignalScope = ReturnType<typeof followSignals>;

/** One invocation owns the scope from preflight through following. */
export function followSignals(output: Output): {
  first: Promise<"signal">;
  readonly interrupted: boolean;
  readonly signal: AbortSignal;
  until<T>(operation: Promise<T>): Promise<T>;
  close(): void;
} {
  const controller = new AbortController();
  let received = false;
  let notify: (reason: "signal") => void = () => {};
  const first = new Promise<"signal">((resolve) => {
    notify = resolve;
  });
  const onSignal = () => {
    if (received) {
      try {
        output.progress("t3c: Operation interrupted.");
      } finally {
        process.exit(4);
      }
    }
    received = true;
    notify("signal");
    controller.abort();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  return {
    first,
    signal: controller.signal,
    until<T>(operation: Promise<T>): Promise<T> {
      return Promise.race([
        operation,
        first.then(() => {
          throw new T3InterruptedError("Operation interrupted.");
        }),
      ]);
    },
    get interrupted() {
      return received;
    },
    close() {
      controller.abort();
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    },
  };
}
