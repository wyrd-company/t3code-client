// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors `packages/contracts/src/relayClient.ts`: the tunnel client that a server needs for
 * T3 Connect. Unknown keys pass.
 */
import { z } from "zod";
import { forwardCompatibleLiteral, taggedUnionWithUnknown } from "./common.ts";

export const RelayClientStatus = taggedUnionWithUnknown("status", [
  z.looseObject({
    status: z.literal("available"),
    executablePath: z.string(),
    source: forwardCompatibleLiteral(["override", "managed", "path"]),
    version: z.string(),
  }),
  z.looseObject({ status: z.literal("missing"), version: z.string() }),
  z.looseObject({
    status: z.literal("unsupported"),
    platform: z.string(),
    arch: z.string(),
    version: z.string(),
  }),
]);
export type RelayClientStatus = z.infer<typeof RelayClientStatus>;

export const RelayClientInstallProgressEvent = taggedUnionWithUnknown("type", [
  z.looseObject({
    type: z.literal("progress"),
    stage: forwardCompatibleLiteral([
      "checking",
      "waiting_for_lock",
      "downloading",
      "verifying",
      "installing",
      "validating",
      "activating",
    ]),
  }),
  z.looseObject({ type: z.literal("complete"), status: RelayClientStatus }),
]);
export type RelayClientInstallProgressEvent = z.infer<typeof RelayClientInstallProgressEvent>;
