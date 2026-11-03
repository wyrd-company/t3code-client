// ---
// relationships:
//   implements: library
// ---
import { defineMethod } from "../spec.ts";
import { ProviderSetupInput } from "../../schemas/providerSetup.ts";
import { ProviderInstallCancelInput, ProviderInstallState } from "../../schemas/providerInstall.ts";

export const providerInstallMethods = {
  /** Downloads the provider's executable into the server's home. */
  "provider.install.start": defineMethod({
    payload: ProviderSetupInput,
    success: ProviderInstallState,
    stream: false,
    scope: "providers:manage",
  }),
  "provider.install.cancel": defineMethod({
    payload: ProviderInstallCancelInput,
    success: ProviderInstallState,
    stream: false,
    scope: "providers:manage",
  }),
  "provider.install.subscribe": defineMethod({
    payload: ProviderSetupInput,
    success: ProviderInstallState,
    stream: true,
    scope: "orchestration:read",
  }),
  /** Removes the managed executable. */
  "provider.install.remove": defineMethod({
    payload: ProviderSetupInput,
    success: ProviderInstallState,
    stream: false,
    scope: "providers:manage",
  }),
};
