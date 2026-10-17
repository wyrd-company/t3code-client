// ---
// relationships:
//   implements: command-line
// ---
import type { InvocationHandler } from "../main.ts";

/** Run, thread, project and server handlers keyed by full command path. */
export const executionHandlers: Record<string, InvocationHandler> = {};
