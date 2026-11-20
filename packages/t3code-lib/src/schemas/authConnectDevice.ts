// ---
// relationships:
//   implements: library-auth
// ---
/** T3 Connect device approval: the devices an environment trusts and the routes that manage them. */
import { z } from "zod";
import { AuthClientMetadata } from "./auth.ts";
import { IsoDateTime, TrimmedNonEmptyString } from "./common.ts";

/** A T3 Connect device key this environment trusts to connect without asking again. */
export const AuthConnectDevice = z.looseObject({
  proofKeyThumbprint: TrimmedNonEmptyString,
  verificationCode: TrimmedNonEmptyString,
  client: AuthClientMetadata.optional(),
  approvedAt: IsoDateTime,
});
export type AuthConnectDevice = z.infer<typeof AuthConnectDevice>;

/** Approves the device waiting on a pairing link's `connectDeviceRequest`. */
export const AuthApproveConnectDeviceInput = z.looseObject({
  pairingLinkId: TrimmedNonEmptyString,
});
export type AuthApproveConnectDeviceInput = z.infer<typeof AuthApproveConnectDeviceInput>;

export const AuthApproveConnectDeviceResult = z.looseObject({ approved: z.boolean() });
export type AuthApproveConnectDeviceResult = z.infer<typeof AuthApproveConnectDeviceResult>;

export const AuthRevokeConnectDeviceInput = z.looseObject({
  proofKeyThumbprint: TrimmedNonEmptyString,
});
export type AuthRevokeConnectDeviceInput = z.infer<typeof AuthRevokeConnectDeviceInput>;

export const AuthRevokeConnectDeviceResult = z.looseObject({ revoked: z.boolean() });
export type AuthRevokeConnectDeviceResult = z.infer<typeof AuthRevokeConnectDeviceResult>;
