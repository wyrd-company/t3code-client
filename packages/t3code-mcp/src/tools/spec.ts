// ---
// relationships:
//   implements: mcp
// ---
import { z } from "zod";
import type { Registry } from "../servers/registry.ts";
export interface ToolContext {
  registry: Registry;
  signal: AbortSignal;
  progress?: (elapsedMs: number) => Promise<void>;
}
export interface ToolSpec {
  name: string;
  description: string;
  readOnly: boolean;
  optIn?: boolean;
  input: z.ZodObject;
  run: (args: unknown, context: ToolContext) => Promise<object>;
}
export function tool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  readOnly: boolean,
  shape: S,
  run: (args: z.output<z.ZodObject<S>>, context: ToolContext) => Promise<object>,
  optIn = false,
): ToolSpec {
  const input = z.object(shape);
  return {
    name,
    description,
    readOnly,
    optIn,
    input,
    run: async (args, context) => run(input.parse(args), context),
  };
}
export const serverArg = z
  .string()
  .min(1)
  .optional()
  .describe("Configured server name; uses defaultServer or the only server when omitted.");
export const threadArgs = {
  server: serverArg,
  threadId: z.string().min(1).describe("Thread id returned by thread_launch or thread_list."),
};
export const pageArgs = { offset: z.int().min(0).default(0), limit: z.int().min(1).default(50) };
export function page<T>(items: T[], offset: number, limit: number) {
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    nextOffset: offset + limit < items.length ? offset + limit : null,
  };
}
