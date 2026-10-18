// ---
// relationships:
//   implements: mcp
// ---
import { z } from "zod";

export const runtimeModes = [
  "approval-required",
  "auto-accept-edits",
  "auto",
  "full-access",
] as const;
export const runtimeMode = z.enum(runtimeModes);
const patterns = z.array(z.string().min(1));
export const serverPolicy = z.strictObject({
  allowTools: patterns.optional(),
  denyTools: patterns.optional(),
  maxRuntimeMode: runtimeMode.optional(),
});
const serverEntry = z.union([
  z.strictObject({ profile: z.string().min(1).optional() }),
  z.strictObject({
    url: z.url().refine((value) => {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        !value.includes("?") &&
        !value.includes("#")
      );
    }),
    tokenEnv: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  }),
]);
export const configFile = z.strictObject({
  servers: z.record(z.string().min(1), serverEntry).optional(),
  defaultServer: z.string().min(1).optional(),
  allowTools: patterns.optional(),
  denyTools: patterns.optional(),
  readOnly: z.boolean().optional(),
  serverPolicies: z.record(z.string().min(1), serverPolicy).optional(),
});
export type ServerEntry = z.infer<typeof serverEntry>;
export type ServerPolicy = z.infer<typeof serverPolicy>;
export interface McpConfig {
  servers: Record<string, ServerEntry>;
  defaultServer?: string;
  allowTools: string[];
  denyTools: string[];
  readOnly: boolean;
  serverPolicies: Record<string, ServerPolicy>;
}
export interface ConfigFlags {
  config?: string;
  servers?: string[];
  defaultServer?: string;
  allowTools?: string[];
  denyTools?: string[];
  readOnly?: boolean;
}
