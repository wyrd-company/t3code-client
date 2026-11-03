// ---
// relationships:
//   implements: library
// ---
/**
 * The ACP registry catalog and the session, provider and sign-out management of an
 * ACP agent instance. Mirrors `acpRegistry.ts` in the contracts. An input has the
 * contracts' bounds. A result stays open, so a newer server's values decode.
 */
import { z } from "zod";
import {
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
} from "./common.ts";

const ACP_REGISTRY_MAX_AGENTS = 512;

const AgentId = TrimmedNonEmptyString.max(128).regex(/^[a-z0-9][a-z0-9._-]*$/u);
const ElicitationId = TrimmedNonEmptyString.max(256);
const SessionId = TrimmedNonEmptyString.max(1_024);
const LlmProviderId = TrimmedNonEmptyString.max(256);
const LlmProtocol = TrimmedNonEmptyString.max(64);
const Cursor = z.string().max(2_048);

export const AcpRegistryDistribution = forwardCompatibleLiteral(["binary", "npx", "uvx"]);
export type AcpRegistryDistribution = z.infer<typeof AcpRegistryDistribution>;

export const AcpRegistrySearchInput = z.looseObject({
  query: z.string().trim().max(120),
  limit: z.number().int().min(1).max(ACP_REGISTRY_MAX_AGENTS).optional(),
});
export type AcpRegistrySearchInput = z.infer<typeof AcpRegistrySearchInput>;

export const AcpRegistrySearchAgent = z.looseObject({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  version: TrimmedNonEmptyString,
  description: z.string(),
  authors: z.array(z.string()),
  license: z.string().nullable(),
  website: z.string().nullable(),
  repository: z.string().nullable(),
  icon: z.string().nullable(),
  distribution: AcpRegistryDistribution,
  integrity: forwardCompatibleLiteral(["sha256", "registry"]),
});
export type AcpRegistrySearchAgent = z.infer<typeof AcpRegistrySearchAgent>;

export const AcpRegistrySearchResult = z.looseObject({
  agents: z.array(AcpRegistrySearchAgent),
});
export type AcpRegistrySearchResult = z.infer<typeof AcpRegistrySearchResult>;

export const AcpRegistryAgentInput = z.looseObject({ agentId: AgentId });
export type AcpRegistryAgentInput = z.infer<typeof AcpRegistryAgentInput>;

export const AcpRegistryPrepareResult = z.looseObject({
  agentId: TrimmedNonEmptyString,
  version: TrimmedNonEmptyString,
  distribution: AcpRegistryDistribution,
  prepared: z.literal(true),
});
export type AcpRegistryPrepareResult = z.infer<typeof AcpRegistryPrepareResult>;

export const AcpRegistryManagedBinaryUninstallResult = z.looseObject({
  agentId: TrimmedNonEmptyString,
  removed: z.boolean(),
});
export type AcpRegistryManagedBinaryUninstallResult = z.infer<
  typeof AcpRegistryManagedBinaryUninstallResult
>;

export const AcpRegistryProbeAuthMethod = z.looseObject({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  description: z.string().nullable(),
  type: forwardCompatibleLiteral(["agent", "env_var", "terminal"]),
  command: z.string().optional(),
  envVarNames: z.array(TrimmedNonEmptyString).optional(),
  link: z.string().optional(),
});
export type AcpRegistryProbeAuthMethod = z.infer<typeof AcpRegistryProbeAuthMethod>;

export const AcpRegistryUrlAuthAction = z.looseObject({
  elicitationId: TrimmedNonEmptyString,
  url: z.string(),
  message: z.string(),
  createdAt: z.string().optional(),
  expiresAt: z.string().optional(),
});
export type AcpRegistryUrlAuthAction = z.infer<typeof AcpRegistryUrlAuthAction>;

export const AcpRegistryAcceptUrlAuthInput = z.looseObject({
  instanceId: ProviderInstanceId,
  elicitationId: ElicitationId,
});
export type AcpRegistryAcceptUrlAuthInput = z.infer<typeof AcpRegistryAcceptUrlAuthInput>;

export const AcpRegistryAcceptUrlAuthResult = z.looseObject({ accepted: z.boolean() });
export type AcpRegistryAcceptUrlAuthResult = z.infer<typeof AcpRegistryAcceptUrlAuthResult>;

export const AcpRegistrySession = z.looseObject({
  sessionId: TrimmedNonEmptyString,
  cwd: TrimmedNonEmptyString,
  additionalDirectories: z.array(TrimmedNonEmptyString),
  title: z.string().nullable(),
  updatedAt: z.string().nullable(),
  importedThreadId: ThreadId.nullable(),
});
export type AcpRegistrySession = z.infer<typeof AcpRegistrySession>;

export const AcpRegistryListSessionsInput = z.looseObject({
  instanceId: ProviderInstanceId,
  projectId: ProjectId,
  cursor: Cursor.optional(),
});
export type AcpRegistryListSessionsInput = z.infer<typeof AcpRegistryListSessionsInput>;

export const AcpRegistryListSessionsResult = z.looseObject({
  sessions: z.array(AcpRegistrySession),
  nextCursor: z.string().nullable(),
  canLoad: z.boolean(),
  canResume: z.boolean(),
  canDelete: z.boolean(),
});
export type AcpRegistryListSessionsResult = z.infer<typeof AcpRegistryListSessionsResult>;

export const AcpRegistryImportSessionInput = z.looseObject({
  instanceId: ProviderInstanceId,
  projectId: ProjectId,
  sessionId: SessionId,
  title: TrimmedNonEmptyString.max(1_024).nullable().optional(),
  updatedAt: TrimmedNonEmptyString.max(128).nullable().optional(),
});
export type AcpRegistryImportSessionInput = z.infer<typeof AcpRegistryImportSessionInput>;

export const AcpRegistryImportSessionResult = z.looseObject({
  threadId: ThreadId,
  imported: z.boolean(),
});
export type AcpRegistryImportSessionResult = z.infer<typeof AcpRegistryImportSessionResult>;

export const AcpRegistryDeleteSessionInput = z.looseObject({
  instanceId: ProviderInstanceId,
  projectId: ProjectId,
  sessionId: SessionId,
});
export type AcpRegistryDeleteSessionInput = z.infer<typeof AcpRegistryDeleteSessionInput>;

export const AcpRegistryDeleteSessionResult = z.looseObject({ deleted: z.literal(true) });
export type AcpRegistryDeleteSessionResult = z.infer<typeof AcpRegistryDeleteSessionResult>;

export const AcpRegistryConfigurableProvider = z.looseObject({
  providerId: TrimmedNonEmptyString,
  supported: z.array(TrimmedNonEmptyString),
  required: z.boolean(),
  current: z.looseObject({ apiType: TrimmedNonEmptyString, baseUrl: z.string() }).nullable(),
});
export type AcpRegistryConfigurableProvider = z.infer<typeof AcpRegistryConfigurableProvider>;

export const AcpRegistryListProvidersInput = z.looseObject({
  instanceId: ProviderInstanceId,
  projectId: ProjectId,
});
export type AcpRegistryListProvidersInput = z.infer<typeof AcpRegistryListProvidersInput>;

export const AcpRegistryListProvidersResult = z.looseObject({
  providers: z.array(AcpRegistryConfigurableProvider),
});
export type AcpRegistryListProvidersResult = z.infer<typeof AcpRegistryListProvidersResult>;

export const AcpRegistrySetProviderInput = z.looseObject({
  instanceId: ProviderInstanceId,
  projectId: ProjectId,
  providerId: LlmProviderId,
  apiType: LlmProtocol,
  baseUrl: z.string().max(2_048),
  /** Write-only secrets. A provider list never returns them. */
  headers: z.record(TrimmedNonEmptyString.max(128), z.string().max(8_192)).optional(),
});
export type AcpRegistrySetProviderInput = z.infer<typeof AcpRegistrySetProviderInput>;

export const AcpRegistrySetProviderResult = z.looseObject({ configured: z.literal(true) });
export type AcpRegistrySetProviderResult = z.infer<typeof AcpRegistrySetProviderResult>;

export const AcpRegistryDisableProviderInput = z.looseObject({
  instanceId: ProviderInstanceId,
  projectId: ProjectId,
  providerId: LlmProviderId,
});
export type AcpRegistryDisableProviderInput = z.infer<typeof AcpRegistryDisableProviderInput>;

export const AcpRegistryDisableProviderResult = z.looseObject({ disabled: z.literal(true) });
export type AcpRegistryDisableProviderResult = z.infer<typeof AcpRegistryDisableProviderResult>;

export const AcpRegistryLogoutInput = z.looseObject({ instanceId: ProviderInstanceId });
export type AcpRegistryLogoutInput = z.infer<typeof AcpRegistryLogoutInput>;

export const AcpRegistryLogoutResult = z.looseObject({ loggedOut: z.literal(true) });
export type AcpRegistryLogoutResult = z.infer<typeof AcpRegistryLogoutResult>;
