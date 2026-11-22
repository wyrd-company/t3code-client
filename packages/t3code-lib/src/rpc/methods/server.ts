// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { containsSecretReference } from "../../schemas/providerInstance.ts";
import { defineMethod, VoidSuccess } from "../spec.ts";
import { ProviderInstanceId, TrimmedNonEmptyString } from "../../schemas/common.ts";
import {
  DatabaseStorageStatusUpdate,
  ServerConfig,
  ServerConfigStreamEvent,
  ServerLifecycleStreamEvent,
  ServerProviderUpdatedPayload,
  ServerSettings,
} from "../../schemas/server.ts";
import {
  ClientActivityReportInput,
  SecretRequestAnswerInput,
  SecretSourceCheckInput,
  SecretSourceCheckResult,
  ServerKeybindingsResult,
  ServerProviderUpdateInput,
  ServerRemoveKeybindingInput,
  ServerUpsertKeybindingInput,
} from "../../schemas/serverActions.ts";
import {
  ServerNpmRelease,
  ServerNpmReleaseInput,
  ServerPrepareTriageInput,
  ServerPrepareTriageResult,
} from "../../schemas/serverRelease.ts";
import {
  DesktopUpdateCommitInput,
  ServerSelfUpdateInput,
  ServerSelfUpdateProgressEvent,
  ServerSelfUpdateResult,
} from "../../schemas/serverSelfUpdate.ts";
import { RelayClientInstallProgressEvent, RelayClientStatus } from "../../schemas/relayClient.ts";
import {
  requiredScopesForSettingsUpdate,
  ServerUpdateSettingsInput,
} from "../../schemas/settingsPatch.ts";
import {
  ListTextGeneratorModelsInput,
  ListTextGeneratorModelsResult,
} from "../../schemas/textGenerator.ts";
import { SourceControlDiscoveryResult } from "../../schemas/sourceControl.ts";
import { UsagePricing, UsageSummary, UsageSummaryInput } from "../../schemas/usage.ts";

export const serverMethods = {
  "server.probe": defineMethod({
    payload: z.looseObject({}),
    success: z.looseObject({}),
    stream: false,
    scope: "orchestration:read",
  }),
  "server.getConfig": defineMethod({
    payload: z.looseObject({}),
    success: ServerConfig,
    stream: false,
    scope: "orchestration:read",
  }),
  "server.refreshProviders": defineMethod({
    payload: z.looseObject({
      instanceId: ProviderInstanceId.optional(),
      cwd: TrimmedNonEmptyString.optional(),
      /** With `instanceId` and `cwd`: rescan the workspace's skills and slash commands. */
      fresh: z.boolean().optional(),
      refreshModels: z.boolean().optional(),
      /**
       * A model picker opened: refetch a stale model manifest and probe providers only when it
       * changed. The server ignores the other fields; the config stream carries the result.
       */
      modelCatalogOnly: z.boolean().optional(),
      /** Read secret references again. Unlocking a vault can prompt on the host. */
      reloadSecrets: z.boolean().optional(),
      /** Reply without snapshots, or with only the snapshot of `instanceId` and `cwd`. */
      workspaceSnapshotsOnDemand: z.boolean().optional(),
      /** With `workspaceSnapshotsOnDemand`: add /usage-limits to the replied providers. */
      usageLimitsCommand: z.boolean().optional(),
      /** A failed workspace scan replies with the machine catalog as a pending snapshot. */
      providerCatalogsOnDemand: z.boolean().optional(),
      /**
       * Reply with no providers; the config stream carries the result. Ignored with `instanceId`
       * and `cwd`, whose reply is the snapshot.
       */
      omitProviders: z.boolean().optional(),
      /**
       * With `providerCatalogsOnDemand`, a cwd reply also carries the machine slash commands and
       * skills with their `catalogDigest`, for a client whose held lists are not current.
       */
      machineCatalog: z.boolean().optional(),
    }),
    success: ServerProviderUpdatedPayload,
    stream: false,
    scope: "orchestration:read",
  }),
  "server.getNpmRelease": defineMethod({
    payload: ServerNpmReleaseInput,
    success: ServerNpmRelease.nullable(),
    stream: false,
    scope: "orchestration:read",
  }),
  "server.prepareTriage": defineMethod({
    payload: ServerPrepareTriageInput,
    success: ServerPrepareTriageResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "server.getDatabaseStorage": defineMethod({
    payload: z.looseObject({}),
    success: DatabaseStorageStatusUpdate,
    stream: true,
    scope: "orchestration:read",
  }),
  /**
   * Restarts the server to return free database pages to disk. Only when the status says
   * `canReclaim`; otherwise it fails with `DatabaseReclaimError`. The connection closes.
   */
  "server.reclaimDatabaseSpace": defineMethod({
    payload: z.looseObject({}),
    success: VoidSuccess,
    stream: false,
    scope: "environment:maintain",
  }),
  /** Lists a text generator's models. It spends the stored API key, so it needs `settings:write`. */
  "server.listTextGeneratorModels": defineMethod({
    payload: ListTextGeneratorModelsInput,
    success: ListTextGeneratorModelsResult,
    stream: false,
    scope: "settings:write",
    payloadScopes: (input) => (containsSecretReference(input) ? ["providers:manage"] : []),
  }),
  "server.getUsageSummary": defineMethod({
    payload: UsageSummaryInput,
    success: UsageSummary,
    stream: false,
    scope: "diagnostics:read",
  }),
  /** The settings, redacted for clients, as `subscribeServerConfig` also sends them. */
  "server.getSettings": defineMethod({
    payload: z.looseObject({}),
    success: ServerSettings,
    stream: false,
    scope: "orchestration:read",
  }),
  /** Reads a secret reference on the server and reports whether it resolved. */
  "server.checkSecretSource": defineMethod({
    payload: SecretSourceCheckInput,
    success: SecretSourceCheckResult,
    stream: false,
    scope: "settings:write",
  }),
  /** A provider-only change needs only `providers:manage`, so `scope` is replaced per payload. */
  "server.updateSettings": defineMethod({
    payload: ServerUpdateSettingsInput,
    success: ServerSettings,
    stream: false,
    scope: "settings:write",
    scopeForPayload: (input) => requiredScopesForSettingsUpdate(input)[0],
    payloadScopes: (input) => requiredScopesForSettingsUpdate(input).slice(1),
  }),
  "server.upsertKeybinding": defineMethod({
    payload: ServerUpsertKeybindingInput,
    success: ServerKeybindingsResult,
    stream: false,
    scope: "settings:write",
  }),
  "server.removeKeybinding": defineMethod({
    payload: ServerRemoveKeybindingInput,
    success: ServerKeybindingsResult,
    stream: false,
    scope: "settings:write",
  }),
  /** Runs the provider's installer on the server host. */
  "server.updateProvider": defineMethod({
    payload: ServerProviderUpdateInput,
    success: ServerProviderUpdatedPayload,
    stream: false,
    scope: "providers:manage",
  }),
  /** Moves the server to `targetVersion`. It replaces the running server when it succeeds. */
  "server.updateServer": defineMethod({
    payload: ServerSelfUpdateInput,
    success: ServerSelfUpdateResult,
    stream: false,
    scope: "environment:maintain",
  }),
  /** `server.updateServer` with its progress. The update continues if the stream closes. */
  "server.updateServerWithProgress": defineMethod({
    payload: ServerSelfUpdateInput,
    success: ServerSelfUpdateProgressEvent,
    stream: true,
    scope: "environment:maintain",
  }),
  /** Lets a desktop host restart into an update that its app downloaded. */
  "server.commitDesktopUpdate": defineMethod({
    payload: DesktopUpdateCommitInput,
    success: ServerSelfUpdateResult,
    stream: false,
    scope: "environment:maintain",
  }),
  "cloud.getRelayClientStatus": defineMethod({
    payload: z.looseObject({}),
    success: RelayClientStatus,
    stream: false,
    scope: "relay:read",
  }),
  /** Downloads the tunnel client into the server's home. */
  "cloud.installRelayClient": defineMethod({
    payload: z.looseObject({}),
    success: RelayClientInstallProgressEvent,
    stream: true,
    scope: "relay:write",
  }),
  "server.reportClientActivity": defineMethod({
    payload: ClientActivityReportInput,
    success: VoidSuccess,
    stream: false,
    scope: "orchestration:read",
  }),
  "server.discoverSourceControl": defineMethod({
    payload: z.looseObject({}),
    success: SourceControlDiscoveryResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "server.refreshUsageRates": defineMethod({
    payload: z.looseObject({}),
    success: UsagePricing,
    stream: false,
    scope: "diagnostics:read",
  }),
  "secrets.answerRequest": defineMethod({
    payload: SecretRequestAnswerInput,
    success: VoidSuccess,
    stream: false,
    scope: "orchestration:operate",
  }),
  subscribeServerConfig: defineMethod({
    payload: z.looseObject({
      environmentThemes: z.boolean().optional(),
      usageLimitSources: z.boolean().optional(),
      usageLimitsCommand: z.boolean().optional(),
      /** Omit per-cwd provider snapshots. `server.refreshProviders` then supplies them. */
      workspaceSnapshotsOnDemand: z.boolean().optional(),
      /** With `workspaceSnapshotsOnDemand`: also omit the machine slash commands and skills. */
      providerCatalogsOnDemand: z.boolean().optional(),
      /**
       * With `providerCatalogsOnDemand`: send a `catalogDigest` in place of the machine slash
       * commands and skills. Load new lists with a cwd snapshot.
       */
      providerCatalogDigests: z.boolean().optional(),
      /** Send provider changes as `providerStatusDeltas` events instead of `providerStatuses`. */
      providerStatusDeltas: z.boolean().optional(),
    }),
    success: ServerConfigStreamEvent,
    stream: true,
    scope: "orchestration:read",
  }),
  subscribeServerLifecycle: defineMethod({
    payload: z.looseObject({}),
    success: ServerLifecycleStreamEvent,
    stream: true,
    scope: "orchestration:read",
  }),
} as const;
