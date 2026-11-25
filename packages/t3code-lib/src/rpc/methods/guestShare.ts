// ---
// relationships:
//   implements: library
// ---
import {
  GuestShareCreateInput,
  GuestShareCreateResult,
} from "../../schemas/orchestration/guestShare.ts";
import { defineMethod } from "../spec.ts";

// 0.1.12 also asks for orchestration:read. 0.1.11 does not, so the server checks it, not this
// client, which would otherwise refuse a call an older server accepts.
export const guestShareMethods = {
  "guestShare.create": defineMethod({
    payload: GuestShareCreateInput,
    success: GuestShareCreateResult,
    stream: false,
    scope: "access:write",
  }),
} as const;
