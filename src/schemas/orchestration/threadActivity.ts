/**
 * A thread activity, typed by its `kind`. The server declares the payload as
 * unknown and builds each kind's payload in its own code, so the payload
 * shapes here mirror that code rather than the contracts package.
 *
 * An activity whose kind is not listed, or whose payload does not match its
 * kind's schema, decodes as an `UnknownThreadActivity` with the payload kept
 * as received. One unfamiliar activity never fails the thread that holds it.
 */
import { z } from "zod";
import {
  EventId,
  IsoDateTime,
  NonNegativeInt,
  TrimmedNonEmptyString,
  TurnId,
  forwardCompatibleLiteral,
} from "../common.ts";
import {
  ApprovalRequestedPayload,
  ApprovalResolvedPayload,
  ProviderApprovalRespondFailedPayload,
  ProviderUserInputRespondFailedPayload,
  UserInputRequestedPayload,
  UserInputResolvedPayload,
} from "./activities.ts";
import { reactorActivityPayloads } from "./activityPayloads/reactors.ts";
import { runtimeActivityPayloads } from "./activityPayloads/runtime.ts";

export const OrchestrationThreadActivityTone = forwardCompatibleLiteral([
  "info",
  "tool",
  "approval",
  "error",
]);
export type OrchestrationThreadActivityTone = z.infer<typeof OrchestrationThreadActivityTone>;

const requestActivityPayloads = {
  "approval.requested": ApprovalRequestedPayload,
  "approval.resolved": ApprovalResolvedPayload,
  "user-input.requested": UserInputRequestedPayload,
  "user-input.resolved": UserInputResolvedPayload,
  "provider.approval.respond.failed": ProviderApprovalRespondFailedPayload,
  "provider.user-input.respond.failed": ProviderUserInputRespondFailedPayload,
} as const;

/** The payload schema of every activity kind this client recognises. */
export const threadActivityPayloads = {
  ...runtimeActivityPayloads,
  ...reactorActivityPayloads,
  ...requestActivityPayloads,
} as const;

type ThreadActivityPayloads = typeof threadActivityPayloads;
export type ThreadActivityKind = keyof ThreadActivityPayloads & string;
export type ThreadActivityPayload<K extends ThreadActivityKind> = z.infer<
  ThreadActivityPayloads[K]
>;

const ThreadActivityFields = z.object({
  id: EventId,
  tone: OrchestrationThreadActivityTone,
  summary: TrimmedNonEmptyString,
  turnId: TurnId.nullable(),
  sequence: NonNegativeInt.optional(),
  createdAt: IsoDateTime,
});
type ThreadActivityFields = z.infer<typeof ThreadActivityFields>;

const ThreadActivityEnvelope = ThreadActivityFields.extend({
  kind: TrimmedNonEmptyString,
  payload: z.unknown(),
}).loose();

/** An activity of a recognised kind whose payload matched that kind's schema. */
export type KnownThreadActivity = {
  [K in ThreadActivityKind]: ThreadActivityFields & {
    readonly kind: K;
    readonly payload: ThreadActivityPayload<K>;
    readonly unknown?: undefined;
  };
}[ThreadActivityKind];

/** An activity of an unrecognised kind, or whose payload did not match its kind. */
export type UnknownThreadActivity = ThreadActivityFields & {
  readonly kind: string;
  readonly payload: unknown;
  readonly unknown: true;
};

export type OrchestrationThreadActivity = KnownThreadActivity | UnknownThreadActivity;

export type ThreadActivityOfKind<K extends ThreadActivityKind> = Extract<
  KnownThreadActivity,
  { readonly kind: K }
>;

function isThreadActivityKind(kind: string): kind is ThreadActivityKind {
  return Object.hasOwn(threadActivityPayloads, kind);
}

export const OrchestrationThreadActivity: z.ZodType<OrchestrationThreadActivity, unknown> =
  ThreadActivityEnvelope.transform((activity): OrchestrationThreadActivity => {
    if (isThreadActivityKind(activity.kind)) {
      const decoded = (threadActivityPayloads[activity.kind] as z.ZodType).safeParse(
        activity.payload,
      );
      if (decoded.success) {
        return { ...activity, payload: decoded.data } as KnownThreadActivity;
      }
    }
    return { ...activity, unknown: true };
  });

/** Narrow an activity to one recognised kind with its typed payload. */
export function isThreadActivityOfKind<K extends ThreadActivityKind>(
  activity: OrchestrationThreadActivity,
  kind: K,
): activity is ThreadActivityOfKind<K> {
  return activity.unknown !== true && activity.kind === kind;
}
