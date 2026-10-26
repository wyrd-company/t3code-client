/**
 * Generic `queued-run.start` command payloads shared by the schema and dispatch
 * tests. Each malformed payload breaks one known field and keeps the others valid.
 */
import { ids } from "./threadFixtures.ts";

type Payload = Record<string, unknown>;

export const queuedRunStart = (fields: Payload = {}): Payload => ({
  type: "queued-run.start",
  commandId: "command-1",
  threadId: ids.threadId,
  runId: ids.runId,
  ...fields,
});

const without = (key: string): Payload =>
  Object.fromEntries(Object.entries(queuedRunStart()).filter(([name]) => name !== key));

const malformedIds = ["", "   ", null, 0, {}];

/** Labelled payloads with exactly one malformed known field. */
export const malformedQueuedRunStarts: readonly (readonly [string, Payload])[] = [
  ...["runId", "threadId", "commandId"].map((key) => [`missing ${key}`, without(key)] as const),
  ...["runId", "threadId", "commandId"].flatMap((key) =>
    malformedIds.map(
      (value) => [`${key} ${JSON.stringify(value)}`, queuedRunStart({ [key]: value })] as const,
    ),
  ),
];
