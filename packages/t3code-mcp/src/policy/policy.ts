// ---
// relationships:
//   implements: mcp
// ---
import type { RuntimeMode } from "@wyrd-company/t3code-lib";
import { runtimeModes, type McpConfig, type ServerPolicy } from "../config/schema.ts";
import { ToolError } from "../errors.ts";

export interface ToolPolicySpec {
  name: string;
  readOnly: boolean;
  optIn?: boolean;
}
export function matches(name: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) =>
    new RegExp(
      `^${pattern
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")}$`,
    ).test(name),
  );
}
export function exposed(
  tool: ToolPolicySpec,
  config: Pick<McpConfig, "allowTools" | "denyTools" | "readOnly">,
): boolean {
  return (
    matches(tool.name, config.allowTools) &&
    !matches(tool.name, config.denyTools) &&
    (!config.readOnly || tool.readOnly) &&
    (!tool.optIn || config.allowTools.includes(tool.name))
  );
}
export function assertAllowed(tool: string, policy: ServerPolicy): void {
  if (!matches(tool, policy.allowTools ?? ["*"]) || matches(tool, policy.denyTools ?? []))
    throw new ToolError("tool_denied", "Tool is denied on this server.");
}
export function boundedMode(
  requested: RuntimeMode | undefined,
  policy: ServerPolicy,
): RuntimeMode | undefined {
  const cap = policy.maxRuntimeMode;
  if (cap === undefined) return requested;
  if (
    requested !== undefined &&
    runtimeModes.indexOf(requested as typeof cap) > runtimeModes.indexOf(cap)
  )
    throw new ToolError("runtime_mode_denied", "Runtime mode exceeds this server's cap.");
  if (requested !== undefined && !runtimeModes.includes(requested as typeof cap))
    throw new ToolError("runtime_mode_denied", "Runtime mode is not covered by this server's cap.");
  return requested ?? cap;
}
