// ---
// relationships:
//   implements: output-contract
// ---
import { T3PreconditionError } from "@wyrd-company/t3code-lib";
import { durationMs } from "../options.ts";
import type { FollowPolicy } from "./followTarget.ts";

function choice<T extends string>(value: unknown, choices: readonly T[], fallback?: T): T {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value === "string" && choices.includes(value as T)) return value as T;
  throw new T3PreconditionError("Invalid follow policy.");
}

export function followPolicy(
  options: Record<string, unknown>,
  defaultOnTimeout: "detach" | "interrupt",
): FollowPolicy {
  return {
    ...(options["timeout"] === undefined
      ? {}
      : { timeoutMs: durationMs(String(options["timeout"])) }),
    onTimeout: choice(options["onTimeout"], ["detach", "interrupt"], defaultOnTimeout),
    onRequest: choice(options["onRequest"], ["fail", "wait"], "fail"),
    ...(options["approve"] === undefined
      ? {}
      : { approve: choice(options["approve"], ["accept", "reject"]) }),
  };
}
