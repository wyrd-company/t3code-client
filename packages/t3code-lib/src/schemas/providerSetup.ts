// ---
// relationships:
//   implements: library
// ---
/**
 * The provider sign-in flow, the ChatGPT profile transfer, the reset credit and
 * the feedback upload. Mirrors `providerSetup.ts`, `provider.ts` and
 * `providerUsageLimits.ts` in the contracts. An input has closed lists and the
 * contracts' bounds. A result stays open, so a newer server's values decode.
 */
import { z } from "zod";
import {
  EnvironmentId,
  IsoDateTime,
  NonNegativeInt,
  ProviderInstanceId,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleArray,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "./common.ts";

const SetupOperationId = TrimmedNonEmptyString.max(128);
const CallbackUrl = TrimmedNonEmptyString.max(16_384);
const TokenText = z.string().max(16_384);

export const ProviderSetupInput = z.looseObject({ instanceId: ProviderInstanceId });
export type ProviderSetupInput = z.infer<typeof ProviderSetupInput>;

export const ProviderAuthStartInput = z.looseObject({
  instanceId: ProviderInstanceId,
  methodId: SetupOperationId.optional(),
  returnUrl: z.string().optional(),
  callbackMode: z.enum(["server", "client"]).optional(),
});
export type ProviderAuthStartInput = z.infer<typeof ProviderAuthStartInput>;

export const ProviderAuthResponse = z.discriminatedUnion("type", [
  z.looseObject({ type: z.literal("browser"), action: z.enum(["accept", "decline"]) }),
  z.looseObject({
    type: z.literal("terminal"),
    data: z.string().max(4_096),
    size: z
      .looseObject({
        cols: z.number().int().min(1).max(500),
        rows: z.number().int().min(1).max(200),
      })
      .optional(),
  }),
  z.looseObject({
    type: z.literal("credentials"),
    values: z
      .record(SetupOperationId, TokenText)
      .refine((values) => Object.keys(values).length <= 16, "Expected at most 16 values."),
  }),
]);
export type ProviderAuthResponse = z.infer<typeof ProviderAuthResponse>;

export const ProviderAuthRespondInput = z.looseObject({
  instanceId: ProviderInstanceId,
  flowId: SetupOperationId,
  interactionId: SetupOperationId,
  response: ProviderAuthResponse,
});
export type ProviderAuthRespondInput = z.infer<typeof ProviderAuthRespondInput>;

export const ProviderAuthCompleteInput = z.looseObject({
  instanceId: ProviderInstanceId,
  flowId: SetupOperationId,
  callbackUrl: CallbackUrl,
});
export type ProviderAuthCompleteInput = z.infer<typeof ProviderAuthCompleteInput>;

export const ProviderAuthCancelInput = z.looseObject({
  instanceId: ProviderInstanceId,
  flowId: SetupOperationId,
});
export type ProviderAuthCancelInput = z.infer<typeof ProviderAuthCancelInput>;

export const ProviderAuthMethod = z.looseObject({
  id: TrimmedNonEmptyString,
  accountEmail: TrimmedNonEmptyString.optional(),
  name: TrimmedNonEmptyString,
  description: z.string().nullable(),
  type: forwardCompatibleLiteral(["agent", "terminal", "credentials"]),
});
export type ProviderAuthMethod = z.infer<typeof ProviderAuthMethod>;

export const ProviderAuthInteraction = taggedUnionWithUnknown("type", [
  z.looseObject({
    type: z.literal("browser"),
    id: TrimmedNonEmptyString,
    url: TrimmedNonEmptyString,
    requiresConsent: z.boolean(),
    acceptsCallback: z.boolean().optional(),
  }),
  z.looseObject({
    type: z.literal("deviceCode"),
    id: TrimmedNonEmptyString,
    url: TrimmedNonEmptyString,
    userCode: TrimmedNonEmptyString,
  }),
  z.looseObject({
    type: z.literal("terminal"),
    id: TrimmedNonEmptyString,
    output: z.string(),
    outputOffset: NonNegativeInt.optional(),
  }),
  z.looseObject({
    type: z.literal("credentials"),
    id: TrimmedNonEmptyString,
    fields: z.array(
      z.looseObject({
        name: TrimmedNonEmptyString,
        label: TrimmedNonEmptyString,
        secret: z.boolean(),
      }),
    ),
  }),
]);
export type ProviderAuthInteraction = z.infer<typeof ProviderAuthInteraction>;

export const ProviderAuthState = z.looseObject({
  instanceId: ProviderInstanceId,
  phase: forwardCompatibleLiteral([
    "idle",
    "starting",
    "waiting",
    "verifying",
    "succeeded",
    "failed",
    "cancelled",
  ]),
  flowId: TrimmedNonEmptyString.nullable(),
  authorizationUrl: z.string().nullable(),
  expiresAt: IsoDateTime.nullable(),
  message: z.string().nullable(),
  methods: forwardCompatibleArray(ProviderAuthMethod).optional(),
  interaction: ProviderAuthInteraction.nullable().optional(),
  credentialOwner: forwardCompatibleLiteral(["provider", "t3"]).optional(),
});
export type ProviderAuthState = z.infer<typeof ProviderAuthState>;

/** A saved ChatGPT connection, as the server reports it. `idTokenHint` is a credential. */
export const ChatGptReconnectProfile = z.looseObject({
  clientId: z.string(),
  subject: z.string().optional(),
  email: z.string().nullable().optional(),
  redirectUri: z.string().optional(),
  connectionLabel: z.string().optional(),
  sharingEnabled: z.boolean().optional(),
  idTokenHint: z.string().optional(),
});
export type ChatGptReconnectProfile = z.infer<typeof ChatGptReconnectProfile>;

/** A ChatGPT connection with its tokens. Handle it as a credential. */
export const ChatGptTransferredProfile = z.looseObject({
  registration: ChatGptReconnectProfile,
  credentials: z.looseObject({
    clientId: z.string(),
    accessToken: z.string().min(1),
    refreshToken: z.string().nullable(),
    idToken: z.string().min(1),
    issuer: z.string(),
    expiresAt: z.number(),
    earliestRefreshAt: z.number().nullable(),
    scopes: z.array(z.string()),
    subject: z.string(),
    email: z.string().nullable(),
  }),
});
export type ChatGptTransferredProfile = z.infer<typeof ChatGptTransferredProfile>;

const ChatGptReconnectProfileWrite = z.looseObject({
  clientId: z.string().regex(/^oaiapp_[\w-]+$/u),
  subject: z.string().optional(),
  email: z.string().nullable().optional(),
  redirectUri: z
    .string()
    .regex(/^http:\/\/(?:127\.0\.0\.1|localhost):[1-9]\d{0,4}\/auth\/callback$/u)
    .optional(),
  connectionLabel: z.string().optional(),
  sharingEnabled: z.boolean().optional(),
  idTokenHint: TokenText.optional(),
});

export const ChatGptReconnectProfileInput = z.looseObject({
  instanceId: ProviderInstanceId,
  methodId: z.string(),
});
export type ChatGptReconnectProfileInput = z.infer<typeof ChatGptReconnectProfileInput>;

export const ChatGptImportProfileInput = z.looseObject({
  instanceId: ProviderInstanceId,
  profile: z.looseObject({
    registration: ChatGptReconnectProfileWrite,
    credentials: z.looseObject({
      clientId: z.string(),
      accessToken: TokenText.min(1),
      refreshToken: TokenText.nullable(),
      idToken: TokenText.min(1),
      issuer: z.string(),
      expiresAt: z.number(),
      earliestRefreshAt: z.number().nullable(),
      scopes: z.array(z.string()),
      subject: z.string(),
      email: z.string().nullable(),
    }),
  }),
});
export type ChatGptImportProfileInput = z.infer<typeof ChatGptImportProfileInput>;

export const ChatGptHandoffInput = z.looseObject({
  instanceId: ProviderInstanceId,
  environmentId: EnvironmentId,
  attemptId: z.string().max(128),
  returnUrl: z.string().max(4_096),
  profile: ChatGptReconnectProfileWrite.nullable(),
});
export type ChatGptHandoffInput = z.infer<typeof ChatGptHandoffInput>;

export const ChatGptHandoffState = taggedUnionWithUnknown("phase", [
  z.looseObject({ phase: z.literal("auth"), state: ProviderAuthState }),
  z.looseObject({ phase: z.literal("finished"), profile: ChatGptTransferredProfile }),
]);
export type ChatGptHandoffState = z.infer<typeof ChatGptHandoffState>;

/** An instance's own credit, or a credit of an account in a usage limit source. */
export const ProviderConsumeResetCreditInput = z.union([
  z.looseObject({ instanceId: ProviderInstanceId }),
  z.looseObject({
    sourceId: z.string(),
    accountId: TrimmedNonEmptyString,
    creditId: TrimmedNonEmptyString,
  }),
]);
export type ProviderConsumeResetCreditInput = z.infer<typeof ProviderConsumeResetCreditInput>;

export const ProviderConsumeResetCreditResult = z.looseObject({
  outcome: forwardCompatibleLiteral(["reset", "nothingToReset", "noCredit", "alreadyRedeemed"]),
  warning: TrimmedNonEmptyString.optional(),
});
export type ProviderConsumeResetCreditResult = z.infer<typeof ProviderConsumeResetCreditResult>;

export const ProviderUploadFeedbackInput = z.looseObject({
  threadId: ThreadId,
  reason: TrimmedNonEmptyString.optional(),
});
export type ProviderUploadFeedbackInput = z.infer<typeof ProviderUploadFeedbackInput>;

export const ProviderUploadFeedbackResult = z.looseObject({ feedbackId: TrimmedNonEmptyString });
export type ProviderUploadFeedbackResult = z.infer<typeof ProviderUploadFeedbackResult>;
