// ---
// relationships:
//   implements: command-line
// ---
import type { InvocationHandler } from "../main.ts";
import { providerUsageHandlers } from "./providerUsage.ts";
import { scheduleHandlers } from "./schedule.ts";

/** Schedule, provider and usage handlers keyed by full command path. */
export const automationHandlers: Record<string, InvocationHandler> = {
  ...scheduleHandlers(),
  ...providerUsageHandlers,
};
