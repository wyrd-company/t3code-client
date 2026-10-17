// ---
// relationships:
//   implements: output-contract
// ---
import type { Output } from "../output.ts";

/** Installed only while a command follows a run. */
export function followSignals(output: Output): {
  first: Promise<"signal">;
  readonly interrupted: boolean;
  close(): void;
} {
  let received = false;
  let notify: (reason: "signal") => void = () => {};
  const first = new Promise<"signal">((resolve) => {
    notify = resolve;
  });
  const onSignal = () => {
    if (received) {
      output.progress("t3c: Operation interrupted.");
      process.exit(4);
    }
    received = true;
    notify("signal");
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  return {
    first,
    get interrupted() {
      return received;
    },
    close() {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    },
  };
}
