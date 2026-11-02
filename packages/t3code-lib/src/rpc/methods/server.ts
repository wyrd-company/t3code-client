// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { defineMethod } from "../spec.ts";
import { ProviderInstanceId, TrimmedNonEmptyString } from "../../schemas/common.ts";
import {
  DatabaseStorageStatusUpdate,
  ServerConfig,
  ServerConfigStreamEvent,
  ServerLifecycleStreamEvent,
  ServerProviderUpdatedPayload,
} from "../../schemas/server.ts";
import {
  ServerNpmRelease,
  ServerNpmReleaseInput,
  ServerPrepareTriageInput,
  ServerPrepareTriageResult,
} from "../../schemas/serverRelease.ts";
import { UsageSummary, UsageSummaryInput } from "../../schemas/usage.ts";

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
      /** Read secret references again. Unlocking a vault can prompt on the host. */
      reloadSecrets: z.boolean().optional(),
      /** Reply without snapshots, or with only the snapshot of `instanceId` and `cwd`. */
      workspaceSnapshotsOnDemand: z.boolean().optional(),
      /** With `workspaceSnapshotsOnDemand`: add /usage-limits to the replied providers. */
      usageLimitsCommand: z.boolean().optional(),
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
  "server.getUsageSummary": defineMethod({
    payload: UsageSummaryInput,
    success: UsageSummary,
    stream: false,
    scope: "diagnostics:read",
  }),
  subscribeServerConfig: defineMethod({
    payload: z.looseObject({
      environmentThemes: z.boolean().optional(),
      usageLimitSources: z.boolean().optional(),
      usageLimitsCommand: z.boolean().optional(),
      /** Omit per-cwd provider snapshots. `server.refreshProviders` then supplies them. */
      workspaceSnapshotsOnDemand: z.boolean().optional(),
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
