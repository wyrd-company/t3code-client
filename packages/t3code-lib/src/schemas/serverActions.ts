// ---
// relationships:
//   implements: library
// ---
/**
 * Inputs and results of the server's keybinding, provider update, client
 * activity and secret request methods. Mirrors `server.ts`, `background.ts`
 * and `secretRequest.ts` in the contracts.
 */
import { z } from "zod";
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  TrimmedNonEmptyString,
  TurnItemId,
} from "./common.ts";
import { KeybindingCommandInput, ResolvedKeybindingsConfig } from "./keybindings.ts";
import { ServerConfigIssues } from "./server.ts";

const KeybindingRule = {
  key: TrimmedNonEmptyString.max(64),
  command: KeybindingCommandInput,
  when: TrimmedNonEmptyString.max(256).optional(),
};

/** The binding to remove. */
export const ServerRemoveKeybindingInput = z.looseObject(KeybindingRule);
export type ServerRemoveKeybindingInput = z.infer<typeof ServerRemoveKeybindingInput>;

export const ServerUpsertKeybindingInput = z.looseObject({
  ...KeybindingRule,
  /** The binding this one takes the place of. */
  replace: ServerRemoveKeybindingInput.optional(),
});
export type ServerUpsertKeybindingInput = z.infer<typeof ServerUpsertKeybindingInput>;

export const ServerKeybindingsResult = z.looseObject({
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
});
export type ServerKeybindingsResult = z.infer<typeof ServerKeybindingsResult>;

export const ServerProviderUpdateInput = z.looseObject({
  provider: ProviderDriverKind,
  targetVersion: TrimmedNonEmptyString.optional(),
  instanceId: ProviderInstanceId.optional(),
});
export type ServerProviderUpdateInput = z.infer<typeof ServerProviderUpdateInput>;

export const BackgroundScope = z.discriminatedUnion("type", [
  z.looseObject({ type: z.literal("server-config") }),
  z.looseObject({
    type: z.literal("provider-status"),
    instanceId: ProviderInstanceId.optional(),
  }),
  z.looseObject({ type: z.literal("vcs-status"), cwd: z.string() }),
  z.looseObject({ type: z.literal("git-refs"), cwd: z.string() }),
  z.looseObject({ type: z.literal("diagnostics") }),
  z.looseObject({ type: z.literal("thread"), threadId: ThreadId }),
]);
export type BackgroundScope = z.infer<typeof BackgroundScope>;

const BackgroundBooleanState = z.enum(["true", "false", "unknown"]);

export const ClientActivityReportInput = z.looseObject({
  environmentId: EnvironmentId.optional(),
  clientId: TrimmedNonEmptyString.max(128),
  clientKind: z.enum(["web", "desktop-renderer", "mobile", "unknown"]),
  visible: z.boolean(),
  focused: z.boolean(),
  recentlyInteracted: z.boolean(),
  appState: z.enum(["active", "inactive", "background", "unknown"]).optional(),
  lowPowerMode: BackgroundBooleanState.optional(),
  scopes: z.array(BackgroundScope),
  ttlMs: z.number().optional(),
  /** The server refuses a time that it cannot read. */
  observedAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Expected a date and time."),
});
export type ClientActivityReportInput = z.infer<typeof ClientActivityReportInput>;

/** The server stores a saved value under a one-use reference. The thread learns only the status. */
export const SecretRequestAnswerInput = z.looseObject({
  threadId: ThreadId,
  turnItemId: TurnItemId,
  answer: z.discriminatedUnion("type", [
    z.looseObject({ type: z.literal("save"), secret: TrimmedNonEmptyString }),
    z.looseObject({ type: z.literal("decline") }),
  ]),
});
export type SecretRequestAnswerInput = z.infer<typeof SecretRequestAnswerInput>;
