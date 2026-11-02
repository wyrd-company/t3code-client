// ---
// relationships:
//   implements: library
// ---
/** Server lifecycle stream events and the self-update outcome that a ready event reports. */
import { z } from "zod";
import {
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "./common.ts";
import { ExecutionEnvironmentDescriptor } from "./environment.ts";

export const ServerSelfUpdateOutcome = z.looseObject({
  id: TrimmedNonEmptyString,
  fromVersion: TrimmedNonEmptyString,
  targetVersion: TrimmedNonEmptyString,
  status: forwardCompatibleLiteral(["committed", "rolled-back", "failed"]),
  reason: TrimmedNonEmptyString.optional(),
});
export type ServerSelfUpdateOutcome = z.infer<typeof ServerSelfUpdateOutcome>;
export const ServerLifecycleReadyPayload = z.looseObject({
  at: IsoDateTime,
  environment: ExecutionEnvironmentDescriptor,
  updateOutcome: ServerSelfUpdateOutcome.optional(),
});
export type ServerLifecycleReadyPayload = z.infer<typeof ServerLifecycleReadyPayload>;
export const ServerLifecycleStreamReadyEvent = z.looseObject({
  version: z.literal(1),
  sequence: NonNegativeInt,
  type: z.literal("ready"),
  payload: ServerLifecycleReadyPayload,
});
export type ServerLifecycleStreamReadyEvent = z.infer<typeof ServerLifecycleStreamReadyEvent>;
export const ServerLifecycleWelcomePayload = z.looseObject({
  environment: ExecutionEnvironmentDescriptor,
  cwd: TrimmedNonEmptyString,
  projectName: TrimmedNonEmptyString,
  bootstrapStatus: forwardCompatibleLiteral(["pending", "complete"]).optional(),
  bootstrapProjectId: ProjectId.optional(),
  bootstrapThreadId: ThreadId.optional(),
  bootstrapProjectCreated: z.boolean().optional(),
  bootstrapThreadCreated: z.boolean().optional(),
});
export type ServerLifecycleWelcomePayload = z.infer<typeof ServerLifecycleWelcomePayload>;
export const ServerLifecycleStreamWelcomeEvent = z.looseObject({
  version: z.literal(1),
  sequence: NonNegativeInt,
  type: z.literal("welcome"),
  payload: ServerLifecycleWelcomePayload,
});
export type ServerLifecycleStreamWelcomeEvent = z.infer<typeof ServerLifecycleStreamWelcomeEvent>;
export const ServerLifecycleLegacyThreadMigrationPayload = z.looseObject({
  status: forwardCompatibleLiteral(["running", "complete"]),
  totalThreadCount: NonNegativeInt,
});
export type ServerLifecycleLegacyThreadMigrationPayload = z.infer<
  typeof ServerLifecycleLegacyThreadMigrationPayload
>;
/** Progress of importing threads recorded by a pre-V2 server. */
export const ServerLifecycleStreamLegacyThreadMigrationEvent = z.looseObject({
  version: z.literal(1),
  sequence: NonNegativeInt,
  type: z.literal("legacyThreadMigration"),
  payload: ServerLifecycleLegacyThreadMigrationPayload,
});
export type ServerLifecycleStreamLegacyThreadMigrationEvent = z.infer<
  typeof ServerLifecycleStreamLegacyThreadMigrationEvent
>;
export const ServerLifecycleStreamEvent = taggedUnionWithUnknown("type", [
  ServerLifecycleStreamWelcomeEvent,
  ServerLifecycleStreamReadyEvent,
  ServerLifecycleStreamLegacyThreadMigrationEvent,
]);
export type ServerLifecycleStreamEvent = z.infer<typeof ServerLifecycleStreamEvent>;
