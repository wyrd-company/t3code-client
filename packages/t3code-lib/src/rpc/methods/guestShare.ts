// ---
// relationships:
//   implements: library
// ---
import {
  GuestShareCreateInput,
  GuestShareCreateResult,
} from "../../schemas/orchestration/guestShare.ts";
import { defineMethod } from "../spec.ts";

export const guestShareMethods = {
  "guestShare.create": defineMethod({
    payload: GuestShareCreateInput,
    success: GuestShareCreateResult,
    stream: false,
    scope: "access:write",
  }),
} as const;
