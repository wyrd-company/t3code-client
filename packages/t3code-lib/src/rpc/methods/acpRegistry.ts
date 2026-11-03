// ---
// relationships:
//   implements: library
// ---
import { defineMethod } from "../spec.ts";
import {
  AcpRegistryAcceptUrlAuthInput,
  AcpRegistryAcceptUrlAuthResult,
  AcpRegistryAgentInput,
  AcpRegistryDeleteSessionInput,
  AcpRegistryDeleteSessionResult,
  AcpRegistryDisableProviderInput,
  AcpRegistryDisableProviderResult,
  AcpRegistryImportSessionInput,
  AcpRegistryImportSessionResult,
  AcpRegistryListProvidersInput,
  AcpRegistryListProvidersResult,
  AcpRegistryListSessionsInput,
  AcpRegistryListSessionsResult,
  AcpRegistryLogoutInput,
  AcpRegistryLogoutResult,
  AcpRegistryManagedBinaryUninstallResult,
  AcpRegistryPrepareResult,
  AcpRegistrySearchInput,
  AcpRegistrySearchResult,
  AcpRegistrySetProviderInput,
  AcpRegistrySetProviderResult,
} from "../../schemas/acpRegistry.ts";

export const acpRegistryMethods = {
  /** Reads the public registry index. */
  "server.searchAcpRegistry": defineMethod({
    payload: AcpRegistrySearchInput,
    success: AcpRegistrySearchResult,
    stream: false,
    scope: "orchestration:read",
  }),
  /** Installs the agent on the server's host. It can use the host's package manager. */
  "server.prepareAcpRegistryAgent": defineMethod({
    payload: AcpRegistryAgentInput,
    success: AcpRegistryPrepareResult,
    stream: false,
    scope: "providers:manage",
  }),
  "server.uninstallAcpRegistryManagedBinary": defineMethod({
    payload: AcpRegistryAgentInput,
    success: AcpRegistryManagedBinaryUninstallResult,
    stream: false,
    scope: "providers:manage",
  }),
  /** `accepted` is `false` when the instance has no such pending sign-in address. */
  "server.acceptAcpRegistryUrlAuth": defineMethod({
    payload: AcpRegistryAcceptUrlAuthInput,
    success: AcpRegistryAcceptUrlAuthResult,
    stream: false,
    scope: "providers:manage",
  }),
  "server.listAcpRegistrySessions": defineMethod({
    payload: AcpRegistryListSessionsInput,
    success: AcpRegistryListSessionsResult,
    stream: false,
    scope: "orchestration:read",
  }),
  /** Creates a thread for the agent's session. `imported` is `false` when one exists. */
  "server.importAcpRegistrySession": defineMethod({
    payload: AcpRegistryImportSessionInput,
    success: AcpRegistryImportSessionResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "server.deleteAcpRegistrySession": defineMethod({
    payload: AcpRegistryDeleteSessionInput,
    success: AcpRegistryDeleteSessionResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "server.listAcpRegistryProviders": defineMethod({
    payload: AcpRegistryListProvidersInput,
    success: AcpRegistryListProvidersResult,
    stream: false,
    scope: "orchestration:read",
  }),
  /** `headers` are write-only secrets. */
  "server.setAcpRegistryProvider": defineMethod({
    payload: AcpRegistrySetProviderInput,
    success: AcpRegistrySetProviderResult,
    stream: false,
    scope: "providers:manage",
  }),
  "server.disableAcpRegistryProvider": defineMethod({
    payload: AcpRegistryDisableProviderInput,
    success: AcpRegistryDisableProviderResult,
    stream: false,
    scope: "providers:manage",
  }),
  /** Stops the instance's sessions and signs the agent out. */
  "server.logoutAcpRegistry": defineMethod({
    payload: AcpRegistryLogoutInput,
    success: AcpRegistryLogoutResult,
    stream: false,
    scope: "providers:manage",
  }),
};
