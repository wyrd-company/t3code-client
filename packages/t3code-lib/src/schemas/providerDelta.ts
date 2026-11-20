// ---
// relationships:
//   implements: library
// ---
/**
 * Provider changes sent as deltas (`providerStatusDeltas`): each provider leaves out the
 * models, slash commands and skills equal to the ones its reader already holds.
 */
import { z } from "zod";
import { forwardCompatibleArray } from "./common.ts";
import {
  ServerProvider,
  ServerProviderModel,
  ServerProviderSkill,
  ServerProviderSlashCommand,
} from "./provider.ts";

/** A provider whose lists are absent when they equal the reader's. No defaults fill them. */
export const ServerProviderDelta = ServerProvider.extend({
  models: z.array(ServerProviderModel).optional(),
  slashCommands: z.array(ServerProviderSlashCommand).optional(),
  skills: z.array(ServerProviderSkill).optional(),
});
export type ServerProviderDelta = z.infer<typeof ServerProviderDelta>;

export const ServerConfigProviderStatusDeltasPayload = z.looseObject({
  /** Every provider in order, as deltas from the list this client last received. */
  providers: forwardCompatibleArray(ServerProviderDelta),
});
export type ServerConfigProviderStatusDeltasPayload = z.infer<
  typeof ServerConfigProviderStatusDeltasPayload
>;

/**
 * Rebuilds the provider list from the one held and the deltas received. A provider whose list
 * the reader never held cannot be rebuilt and is left out, as upstream drops it.
 */
export function applyServerProviderDeltas(
  previous: readonly ServerProvider[],
  deltas: readonly ServerProviderDelta[],
): ServerProvider[] {
  const held = new Map(previous.map((provider) => [provider.instanceId, provider]));
  return deltas.flatMap((delta) => {
    const base = held.get(delta.instanceId);
    const models = delta.models ?? base?.models;
    const slashCommands = delta.slashCommands ?? base?.slashCommands;
    const skills = delta.skills ?? base?.skills;
    return models && slashCommands && skills ? [{ ...delta, models, slashCommands, skills }] : [];
  });
}
