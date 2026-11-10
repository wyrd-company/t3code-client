// ---
// relationships:
//   implements: mcp
// ---
import { schedulerTools } from "./scheduler.ts";
import { threadTools } from "./threads.ts";
import { threadTagTools } from "./threadTags.ts";
import { providerTools } from "./providers.ts";
import { terminalTools } from "./terminals.ts";
import { diagnosticsTools } from "./diagnostics.ts";
import { localServerTools } from "./localServers.ts";
export const tools = [
  ...schedulerTools,
  ...threadTools,
  ...threadTagTools,
  ...terminalTools,
  ...diagnosticsTools,
  ...localServerTools,
  ...providerTools,
] as const;
export const toolNames = tools.map((tool) => tool.name);
