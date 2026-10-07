// ---
// relationships:
//   implements: design
// ---
/**
 * `OrchestrationV2Command`: everything a client may send to
 * `orchestration.dispatchCommand`. Strict, because the library validates
 * what the caller passes before it is sent.
 */
import { z } from "zod";
import { messageCommandMembers } from "./commands/message.ts";
import { pullRequestCommandMembers } from "./commands/pullRequest.ts";
import { relationCommandMembers } from "./commands/relations.ts";
import { threadCommandMembers } from "./commands/thread.ts";

export const OrchestrationV2Command = z.discriminatedUnion("type", [
  ...threadCommandMembers,
  ...pullRequestCommandMembers,
  ...messageCommandMembers,
  ...relationCommandMembers,
]);
export type OrchestrationV2Command = z.infer<typeof OrchestrationV2Command>;
export type OrchestrationV2CommandType = OrchestrationV2Command["type"];
export type OrchestrationV2CommandOfType<T extends OrchestrationV2CommandType> = Extract<
  OrchestrationV2Command,
  { type: T }
>;

export * from "./commands/thread.ts";
export * from "./commands/pullRequest.ts";
export * from "./commands/message.ts";
export * from "./commands/relations.ts";
