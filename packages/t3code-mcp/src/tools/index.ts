// ---
// relationships:
//   implements: mcp
// ---
import { schedulerTools } from "./scheduler.ts";
import { threadTools } from "./threads.ts";
import { providerTools } from "./providers.ts";
import { terminalTools } from "./terminals.ts";
import { diagnosticsTools } from "./diagnostics.ts";
export const tools = [
  ...schedulerTools,
  ...threadTools,
  ...terminalTools,
  ...diagnosticsTools,
  ...providerTools,
] as const;
export const toolNames = tools.map((tool) => tool.name);
