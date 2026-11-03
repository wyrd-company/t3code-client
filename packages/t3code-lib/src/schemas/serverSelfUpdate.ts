// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors the self update part of `packages/contracts/src/server.ts`: what asks a server to
 * move to another version of `t3`. A closed value in an input has its own form, because the
 * same name in a result stays open for a newer server. Unknown keys pass.
 */
import { z } from "zod";
import {
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "./common.ts";

export const ServerSelfUpdateInput = z.looseObject({
  /** An exact npm version, not a dist-tag. */
  targetVersion: TrimmedNonEmptyString,
  /** A desktop host moves its app to this update track first. Send it only for a track switch. */
  channel: z.enum(["latest", "nightly"]).optional(),
  /** The target release's highest migration. A host refuses to change track without it. */
  targetDatabaseMigration: z.number().int().optional(),
});
export type ServerSelfUpdateInput = z.input<typeof ServerSelfUpdateInput>;

export const ServerSelfUpdateResult = z.looseObject({
  targetVersion: TrimmedNonEmptyString,
  method: forwardCompatibleLiteral(["boot-service", "respawn", "desktop-app"]),
  updateId: TrimmedNonEmptyString.nullish(),
  desktopUpdateToken: TrimmedNonEmptyString.nullish(),
});
export type ServerSelfUpdateResult = z.infer<typeof ServerSelfUpdateResult>;

export const DesktopUpdateCommitInput = z.looseObject({
  requestId: TrimmedNonEmptyString,
});
export type DesktopUpdateCommitInput = z.input<typeof DesktopUpdateCommitInput>;

export const ServerSelfUpdateProgressEvent = taggedUnionWithUnknown("type", [
  z.looseObject({
    type: z.literal("progress"),
    stage: forwardCompatibleLiteral(["downloading", "installing"]),
  }),
  z.looseObject({ type: z.literal("complete"), result: ServerSelfUpdateResult }),
]);
export type ServerSelfUpdateProgressEvent = z.infer<typeof ServerSelfUpdateProgressEvent>;
