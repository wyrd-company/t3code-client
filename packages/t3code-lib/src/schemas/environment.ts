// ---
// relationships:
//   implements: library-facades
// ---
import { z } from "zod";

import { EnvironmentId, TrimmedNonEmptyString, forwardCompatibleLiteral } from "./common.ts";

/** The orchestration wire protocol this client speaks; the server refuses others. */
export const ORCHESTRATION_PROTOCOL_VERSION = 2;
export const ORCHESTRATION_PROTOCOL_VERSION_TEXT = "2";
/** Query parameter on the `/ws` upgrade that names the protocol. */
export const ORCHESTRATION_PROTOCOL_QUERY_PARAM = "orchestrationProtocol";
/** Header on orchestration HTTP routes that names the protocol. */
export const ORCHESTRATION_PROTOCOL_HEADER = "x-t3-orchestration-protocol";

export const ExecutionEnvironmentPlatformOs = z.enum(["darwin", "linux", "windows", "unknown"]);
export type ExecutionEnvironmentPlatformOs = z.infer<typeof ExecutionEnvironmentPlatformOs>;

export const ExecutionEnvironmentPlatformArch = z.enum(["arm64", "x64", "other"]);
export type ExecutionEnvironmentPlatformArch = z.infer<typeof ExecutionEnvironmentPlatformArch>;

export const ExecutionEnvironmentPlatform = z.looseObject({
  os: ExecutionEnvironmentPlatformOs,
  arch: ExecutionEnvironmentPlatformArch,
  machine: z.string().optional(),
});
export type ExecutionEnvironmentPlatform = z.infer<typeof ExecutionEnvironmentPlatform>;

export const ThreadEnvMode = forwardCompatibleLiteral(["local", "worktree"]);
export type ThreadEnvMode = z.infer<typeof ThreadEnvMode>;

export const ServerInstallation = z.looseObject({
  kind: forwardCompatibleLiteral(["npx", "pnpm-dlx", "bunx", "npm-global"]),
  prefix: TrimmedNonEmptyString.optional(),
});
export type ServerInstallation = z.infer<typeof ServerInstallation>;

export const ExecutionEnvironmentCapabilities = z.looseObject({
  repositoryIdentity: z.boolean().default(false),
  connectionProbe: z.boolean().optional(),
  attachmentUploads: z.boolean().optional(),
  questionAttachments: z.boolean().optional(),
  fileAttachments: z.looseObject({ maxUploadBytes: z.number().int().min(1) }).optional(),
  inlineMessageContext: z.boolean().optional(),
  /** Server publishes environment themes through configuration streams. */
  environmentThemes: z.boolean().optional(),
  /** Server streams quota from configured usage-limit sources. */
  usageLimitSources: z.boolean().optional(),
  /** Server persists custom model rates and applies them to usage summaries. */
  usagePriceOverrides: z.boolean().optional(),
  /** Server maps model names through configured usage aliases. */
  usageModelAliases: z.boolean().optional(),
  threadSettlement: z.boolean().optional(),
  threadVisitedTracking: z.boolean().optional(),
  threadPullRequestWatch: z.boolean().optional(),
  serverResolvedCommandContext: z.boolean().optional(),
  serverBrowser: z.boolean().optional(),
  projectWorktreeCleanup: z.boolean().optional(),
  settledWorktreeCleanup: z.boolean().optional(),
  worktreesDirectory: z.boolean().optional(),
  /** Server can exclude pull-request-linked threads from inactivity settlement. */
  threadAutoSettlementScope: z.boolean().optional(),
  serverInstallation: ServerInstallation.optional().catch(undefined),
});
export type ExecutionEnvironmentCapabilities = z.infer<typeof ExecutionEnvironmentCapabilities>;

export const ExecutionEnvironmentDescriptor = z.looseObject({
  environmentId: EnvironmentId,
  label: TrimmedNonEmptyString,
  platform: ExecutionEnvironmentPlatform,
  serverVersion: TrimmedNonEmptyString,
  /** Orchestration wire version; absent on hosts from before explicit negotiation. */
  orchestrationProtocolVersion: z.number().int().optional(),
  capabilities: ExecutionEnvironmentCapabilities,
});
export type ExecutionEnvironmentDescriptor = z.infer<typeof ExecutionEnvironmentDescriptor>;

/** The checkout's own remote when it names a different repository than the canonical one. */
export const RepositoryOrigin = z.looseObject({
  canonicalKey: TrimmedNonEmptyString,
  remoteUrl: TrimmedNonEmptyString.optional(),
  displayName: TrimmedNonEmptyString.optional(),
});
export type RepositoryOrigin = z.infer<typeof RepositoryOrigin>;

export const RepositoryIdentityLocator = z.looseObject({
  source: z.literal("git-remote"),
  remoteName: TrimmedNonEmptyString,
  remoteUrl: TrimmedNonEmptyString,
});
export type RepositoryIdentityLocator = z.infer<typeof RepositoryIdentityLocator>;

export const RepositoryIdentity = z.looseObject({
  canonicalKey: TrimmedNonEmptyString,
  locator: RepositoryIdentityLocator,
  webUrl: TrimmedNonEmptyString.optional(),
  rootPath: TrimmedNonEmptyString.optional(),
  displayName: TrimmedNonEmptyString.optional(),
  provider: TrimmedNonEmptyString.optional(),
  owner: TrimmedNonEmptyString.optional(),
  name: TrimmedNonEmptyString.optional(),
  origin: RepositoryOrigin.optional(),
});
export type RepositoryIdentity = z.infer<typeof RepositoryIdentity>;
