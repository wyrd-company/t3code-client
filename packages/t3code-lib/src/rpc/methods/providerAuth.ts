// ---
// relationships:
//   implements: library
// ---
import { defineMethod } from "../spec.ts";
import {
  ChatGptHandoffInput,
  ChatGptHandoffState,
  ChatGptImportProfileInput,
  ChatGptReconnectProfile,
  ChatGptReconnectProfileInput,
  ProviderAuthCancelInput,
  ProviderAuthCompleteInput,
  ProviderAuthRespondInput,
  ProviderAuthStartInput,
  ProviderAuthState,
  ProviderConsumeResetCreditInput,
  ProviderConsumeResetCreditResult,
  ProviderSetupInput,
  ProviderUploadFeedbackInput,
  ProviderUploadFeedbackResult,
} from "../../schemas/providerSetup.ts";

export const providerAuthMethods = {
  "provider.auth.start": defineMethod({
    payload: ProviderAuthStartInput,
    success: ProviderAuthState,
    stream: false,
    scope: "providers:manage",
  }),
  "provider.auth.respond": defineMethod({
    payload: ProviderAuthRespondInput,
    success: ProviderAuthState,
    stream: false,
    scope: "providers:manage",
  }),
  /** `callbackUrl` carries the provider's one-use code. */
  "provider.auth.complete": defineMethod({
    payload: ProviderAuthCompleteInput,
    success: ProviderAuthState,
    stream: false,
    scope: "providers:manage",
  }),
  "provider.auth.cancel": defineMethod({
    payload: ProviderAuthCancelInput,
    success: ProviderAuthState,
    stream: false,
    scope: "providers:manage",
  }),
  /** Signs the instance out and stops its sessions. */
  "provider.auth.logout": defineMethod({
    payload: ProviderSetupInput,
    success: ProviderAuthState,
    stream: false,
    scope: "providers:manage",
  }),
  "provider.auth.subscribe": defineMethod({
    payload: ProviderSetupInput,
    success: ProviderAuthState,
    stream: true,
    scope: "providers:manage",
  }),
  /** `null` when there is no saved connection to reconnect. */
  "provider.chatgpt.reconnect-profile": defineMethod({
    payload: ChatGptReconnectProfileInput,
    success: ChatGptReconnectProfile.nullable(),
    stream: false,
    scope: "providers:manage",
  }),
  /** Replaces the instance's connection with the profile and stops its sessions. */
  "provider.chatgpt.import-profile": defineMethod({
    payload: ChatGptImportProfileInput,
    success: ProviderAuthState,
    stream: false,
    scope: "providers:manage",
  }),
  /** Runs a sign-in for another environment. The last item holds that sign-in's tokens. */
  "provider.chatgpt.handoff.subscribe": defineMethod({
    payload: ChatGptHandoffInput,
    success: ChatGptHandoffState,
    stream: true,
    scope: "providers:manage",
  }),
  /** Spends a banked credit of the account. */
  "provider.consumeResetCredit": defineMethod({
    payload: ProviderConsumeResetCreditInput,
    success: ProviderConsumeResetCreditResult,
    stream: false,
    scope: "providers:manage",
  }),
  /** Sends feedback on the thread's running provider session to that provider. */
  "provider.uploadFeedback": defineMethod({
    payload: ProviderUploadFeedbackInput,
    success: ProviderUploadFeedbackResult,
    stream: false,
    scope: "orchestration:operate",
  }),
} as const;
