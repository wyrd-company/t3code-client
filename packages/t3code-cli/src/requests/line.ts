// ---
// relationships:
//   implements: request-watch
// ---
import type { ReportedRequest } from "@wyrd-company/t3code-lib";

export function requestLine({ item, ...request }: ReportedRequest): string {
  return `${JSON.stringify({ type: "request", ...request, item: item ?? null })}\n`;
}
