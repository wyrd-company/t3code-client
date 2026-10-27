// ---
// relationships:
//   implements: mcp
// ---
import { schemas } from "@wyrd-company/t3code-lib";
import { z } from "zod";
import { defineTool } from "../tool.ts";

export const providerTools = [
  defineTool(
    "provider_status",
    "Read provider instance authentication, installation, availability and usage limits. Filter by exact instanceId, not driver kind. Unknown instance returns an empty list. Historical usage is separate.",
    z.strictObject({ instanceId: z.string().trim().min(1).optional() }),
    async ({ instanceId }, client, signal) => ({
      providers: await client.server.providerStatus(instanceId, signal),
    }),
  ),
  defineTool(
    "usage_summary",
    "Read historical usage buckets for inclusive calendar days in an IANA time zone. Requires diagnostics:read. Preserves source diagnostics, pricing and scan metadata; session counts overlap across buckets. May scan provider transcripts.",
    schemas.usage.UsageSummaryInput.strict(),
    (input, client, signal) => client.server.usageSummary(input, signal),
  ),
] as const;
