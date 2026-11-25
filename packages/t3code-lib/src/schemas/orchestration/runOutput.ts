// ---
// relationships:
//   implements: library
// ---
/** A run asked for a result as data: its JSON Schema, and the value the server accepted. */
import { z } from "zod";
import { IsoDateTime, JsonValue, RunId } from "../common.ts";

/** A JSON Schema object, as a launch or a message asks a run to answer against it. */
export const OrchestrationV2OutputSchema = z.record(z.string(), JsonValue);
export type OrchestrationV2OutputSchema = z.infer<typeof OrchestrationV2OutputSchema>;

/** What a run returned as data: a value the server accepted against the run's `outputSchema`. */
export const OrchestrationV2RunOutput = z.looseObject({
  value: JsonValue,
  submittedAt: IsoDateTime,
});
export type OrchestrationV2RunOutput = z.infer<typeof OrchestrationV2RunOutput>;

/** The payload of `run.output-submitted`. */
export const OrchestrationV2RunOutputSubmitted = z.looseObject({
  runId: RunId,
  output: OrchestrationV2RunOutput,
});
export type OrchestrationV2RunOutputSubmitted = z.infer<typeof OrchestrationV2RunOutputSubmitted>;
