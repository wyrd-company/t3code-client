// ---
// relationships:
//   implements: mcp
// ---
import { z } from "zod";
import { runtimeModes } from "../config/schema.ts";
import { ToolError } from "../errors.ts";
import type { Registry } from "../servers/registry.ts";
import { tool, serverArg, pageArgs, page } from "./spec.ts";
export const PROBE_DEADLINE_MS = 5000;
async function probe(registry: Registry, server: string, signal: AbortSignal) {
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  let abort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(combined.reason);
    combined.addEventListener("abort", abort, { once: true });
    if (combined.aborted) abort();
  });
  const timeout = setTimeout(
    () =>
      controller.abort(
        new ToolError("server_unreachable", "Server probe exceeded the 5 s deadline."),
      ),
    PROBE_DEADLINE_MS,
  );
  try {
    return await Promise.race([
      (async () => {
        const client = await registry.client(server, "server_list");
        combined.throwIfAborted();
        const [environment] = await Promise.all([
          client.server.environment(combined),
          client.server.getConfig(combined),
        ]);
        return environment;
      })(),
      cancelled,
    ]);
  } finally {
    clearTimeout(timeout);
    combined.removeEventListener("abort", abort);
    controller.abort();
  }
}
export const discoveryTools = [
  tool(
    "server_list",
    "List configured servers. With probe:true, check each server's reachability, version and environment independently with a 5 s per-server deadline. Start cross-server dispatch here, then use server_capabilities.",
    true,
    { probe: z.boolean().default(false) },
    async (args, { registry, signal }) => ({
      servers: await Promise.all(
        Object.entries(registry.config.servers).map(async ([server, entry]) => {
          const base = { server, ...("profile" in entry ? { profile: entry.profile } : {}) };
          if (!args.probe) return base;
          try {
            const environment = await probe(registry, server, signal);
            return { ...base, reachable: true, version: environment.serverVersion, environment };
          } catch (error) {
            const failure = await registry.error(error);
            return {
              ...base,
              reachable: false,
              error: { code: failure.code, message: failure.message },
            };
          }
        }),
      ),
    }),
  ),
  tool(
    "server_capabilities",
    "Discover one server's provider instances, model IDs, model options and runtime modes. Use the returned instanceId/model in thread_launch.modelSelection; do not guess model names.",
    true,
    { server: serverArg },
    async (args, { registry, signal }) => {
      const server = registry.resolve(args.server);
      const client = await registry.client(server, "server_capabilities");
      const config = await client.server.getConfig(signal);
      return {
        server,
        version: config.environment.serverVersion,
        providers: config.providers.map((provider) => ({
          instanceId: provider.instanceId,
          displayName: provider.displayName,
          driver: provider.driver,
          enabled: provider.enabled,
          installed: provider.installed,
          status: provider.status,
          availability: provider.availability,
          unavailableReason: provider.unavailableReason,
          models: provider.models,
        })),
        runtimeModes,
      };
    },
  ),
  tool(
    "project_list",
    "List projects on a server with workspace roots. offset/limit paginate the result. Use a projectId in thread_launch, or use project_ensure for a workspace root.",
    true,
    { server: serverArg, ...pageArgs },
    async (args, { registry, signal }) => {
      const server = registry.resolve(args.server);
      const client = await registry.client(server, "project_list");
      return {
        server,
        ...page(
          (await client.projects.list(signal)).map((p) => ({
            projectId: p.id,
            title: p.title,
            workspaceRoot: p.workspaceRoot,
          })),
          args.offset,
          args.limit,
        ),
      };
    },
  ),
  tool(
    "project_ensure",
    "Find or create a project by workspaceRoot on the named server. title defaults to the root's last path component. Returns the projectId for thread_launch.",
    false,
    { server: serverArg, workspaceRoot: z.string().min(1), title: z.string().min(1).optional() },
    async (args, { registry, signal }) => {
      const server = registry.resolve(args.server);
      const client = await registry.client(server, "project_ensure");
      const project = await client.projects.ensure(
        {
          workspaceRoot: args.workspaceRoot,
          title: args.title ?? args.workspaceRoot.split(/[\\/]/).findLast(Boolean) ?? "Project",
        },
        signal,
      );
      return {
        server,
        projectId: project.id,
        title: project.title,
        workspaceRoot: project.workspaceRoot,
      };
    },
  ),
];
