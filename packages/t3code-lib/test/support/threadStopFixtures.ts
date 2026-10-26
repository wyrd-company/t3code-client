/**
 * Generic `thread.stop` command payloads shared by the schema and dispatch
 * tests. Each malformed payload breaks one known field and keeps the others valid.
 */
import { ids } from "./threadFixtures.ts";

type Payload = Record<string, unknown>;

export const threadStop = (fields: Payload = {}): Payload => ({
  type: "thread.stop",
  commandId: "command-1",
  threadId: ids.threadId,
  ...fields,
});

const without = (key: string): Payload =>
  Object.fromEntries(Object.entries(threadStop()).filter(([name]) => name !== key));

/** Reasons the tagged contract accepts: any string, never trimmed or bounded. */
export const threadStopReasons: readonly Payload[] = [
  {},
  { reason: "" },
  { reason: "  padded reason \t" },
  { reason: "Line one.\nLine two." },
  { reason: "Ünïcode reason ✓" },
  { reason: "x".repeat(10_000) },
];

const malformedIds = ["", "   ", null, 0, {}];

/** Labelled payloads with exactly one malformed known field. */
export const malformedThreadStops: readonly (readonly [string, Payload])[] = [
  ...[null, 0, 1, false, true, [], {}].map(
    (reason) => [`reason ${JSON.stringify(reason)}`, threadStop({ reason })] as const,
  ),
  ["missing threadId", without("threadId")],
  ["missing commandId", without("commandId")],
  ...malformedIds.map(
    (value) => [`threadId ${JSON.stringify(value)}`, threadStop({ threadId: value })] as const,
  ),
  ...malformedIds.map(
    (value) => [`commandId ${JSON.stringify(value)}`, threadStop({ commandId: value })] as const,
  ),
];
