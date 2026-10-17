// ---
// relationships:
//   implements: command-contract
// ---
import { T3PreconditionError } from "@wyrd-company/t3code-lib";

export function durationMs(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(value);
  const factors: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  const number = match ? Number(match[1]) * factors[match[2] ?? "s"]! : NaN;
  if (!Number.isFinite(number) || number <= 0)
    throw new T3PreconditionError("Duration must be positive (ms, s, m or h; bare seconds).");
  return number;
}

export function checkNode(version: string): void {
  const [major, minor] = version.split(".").map(Number);
  if (
    major === undefined ||
    !Number.isFinite(major) ||
    major < 22 ||
    (major === 22 && (minor ?? 0) < 16)
  ) {
    throw new T3PreconditionError("t3c requires Node >=22.16.");
  }
}
