// ---
// relationships:
//   implements: command-line
// ---
import type { InvocationHandler } from "../main.ts";
import { inspectionHandlers } from "./inspection/index.ts";
import { threadWait } from "./threadWait.ts";

/** Run, thread, project and server handlers keyed by full command path. */
export const executionHandlers: Record<string, InvocationHandler> = {
  ...inspectionHandlers,
  "thread wait": threadWait,
};
