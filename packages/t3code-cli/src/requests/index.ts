// ---
// relationships:
//   implements: request-watch
// ---
import type { InvocationHandler } from "../main.ts";
import { watch } from "./watch.ts";

export const requestsHandlers: Record<string, InvocationHandler> = { "requests watch": watch };
