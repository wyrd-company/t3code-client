// ---
// relationships:
//   verifies: command-line
// ---
import { setTimeout } from "node:timers/promises";

// Hold CLI startup past the former 500 ms signal timer.
await setTimeout(750);

const stdin = process.stdin;
stdin.on("newListener", function observeRead(event) {
  if (event !== "readable") return;
  stdin.off("newListener", observeRead);
  // The async iterator uses a readable listener. Report after it has been attached
  // and the CLI has reached its wait. The parent leaves the pipe open and empty.
  setImmediate(() => process.send("waiting on stdin"));
});
