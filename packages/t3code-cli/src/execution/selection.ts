// ---
// relationships:
//   implements: command-line
// ---
import * as NodePath from "node:path";
import {
  schemas,
  type ModelSelection,
  T3NotFoundError,
  T3PreconditionError,
  projectId,
  type OrchestrationProjectShell,
  type T3Client,
} from "@wyrd-company/t3code-lib";
import { parseModelOptions, resolveModelOptions, type ModelOptionInput } from "./modelOptions.ts";

type ServerProvider = Awaited<ReturnType<T3Client["server"]["providers"]>>[number];

export interface DispatchOptions extends ModelOptionInput {
  project?: string;
  projectPath?: string;
  provider?: string;
  model?: string;
  mode?: string;
  title?: string;
  worktree?: boolean;
  existingWorktree?: string;
  baseRef?: string;
  branch?: string;
  /** Undefined when neither --start-from-origin nor --no-start-from-origin is given. */
  startFromOrigin?: boolean;
  thread?: string;
  promptFile?: string;
  wait?: boolean;
}

export function missingResource(kind: string): T3NotFoundError {
  return new T3NotFoundError(`Selected ${kind} not found.`, {
    status: 404,
    method: "LOCAL",
    path: kind,
    body: undefined,
  });
}

export function validateDispatchOptions(options: DispatchOptions): void {
  if (options.project !== undefined && options.projectPath !== undefined)
    throw new T3PreconditionError("Choose one project source.");
  if (options.worktree && options.existingWorktree !== undefined)
    throw new T3PreconditionError("Choose one workspace strategy.");
  if (options.baseRef !== undefined && !options.worktree)
    throw new T3PreconditionError("Base ref requires worktree.");
  if (options.branch !== undefined && !options.worktree)
    throw new T3PreconditionError("Branch requires worktree.");
  if (options.startFromOrigin !== undefined && !options.worktree)
    throw new T3PreconditionError("Start from origin requires worktree.");
  if (
    options.thread !== undefined &&
    (options.project !== undefined ||
      options.projectPath !== undefined ||
      options.worktree ||
      options.existingWorktree !== undefined ||
      options.baseRef !== undefined)
  )
    throw new T3PreconditionError("Continuation retains the existing workspace.");
  for (const value of [
    options.project,
    options.projectPath,
    options.provider,
    options.model,
    options.mode,
    options.title,
    options.existingWorktree,
    options.baseRef,
    options.branch,
    options.thread,
  ])
    if (value !== undefined && !value.trim())
      throw new T3PreconditionError("Selection cannot be blank.");
  parseModelOptions(options.modelOption);
}

export async function selectProject(
  client: T3Client,
  options: DispatchOptions,
): Promise<OrchestrationProjectShell> {
  if (options.project !== undefined) {
    const project = await client.projects.get(projectId(options.project));
    if (!project) throw missingResource("project");
    return project;
  }
  if (options.projectPath !== undefined)
    return client.projects.ensure({
      workspaceRoot: options.projectPath,
      title: NodePath.basename(options.projectPath) || "Project",
    });
  const scratch = await client.projects.ensureScratch();
  const project = await client.projects.get(scratch.projectId);
  if (!project) throw missingResource("project");
  return project;
}

/**
 * Resolve only live catalog entries, including custom models and aliases.
 * Inherited options apply only to the same instance and model; explicit model
 * options are validated against that model's advertised descriptors.
 */
export function selectModel(
  providers: readonly ServerProvider[],
  options: DispatchOptions,
  projectDefault: ModelSelection | null,
  serverDefault: unknown,
): ModelSelection {
  const parsedDefault = schemas.orchestrationModel.ModelSelection.safeParse(serverDefault);
  const fallback = projectDefault ?? (parsedDefault.success ? parsedDefault.data : undefined);
  const instance = options.provider ?? fallback?.instanceId;
  const model = options.model ?? (instance === fallback?.instanceId ? fallback?.model : undefined);
  const pool =
    instance === undefined ? providers : providers.filter((p) => p.instanceId === instance);
  if (instance !== undefined && pool.length === 0) throw missingResource("provider");
  const matches = pool.flatMap((provider) =>
    provider.models
      .filter((candidate) =>
        model === undefined
          ? candidate.isDefault === true
          : candidate.slug === model || candidate.aliases?.includes(model),
      )
      .map((candidate) => ({ provider, candidate })),
  );
  if (matches.length === 0) {
    if (model !== undefined) throw missingResource("model");
    throw new T3PreconditionError("Select a provider and model.");
  }
  if (matches.length !== 1) throw new T3PreconditionError("Model selection is ambiguous.");
  const { provider, candidate } = matches[0]!;
  // Upstream apps/web/src/providerInstances.ts: isSelectableProviderInstanceEntry.
  // Installation and probe status are diagnostics, not selection restrictions.
  if (!provider.enabled || provider.availability === "unavailable")
    throw missingResource("provider");
  const inherited =
    fallback?.instanceId === provider.instanceId &&
    (fallback.model === candidate.slug || candidate.aliases?.includes(fallback.model))
      ? fallback.options
      : undefined;
  const selected = resolveModelOptions(candidate, options, inherited) ?? inherited;
  return {
    instanceId: provider.instanceId,
    model: candidate.slug,
    ...(selected === undefined ? {} : { options: selected }),
  };
}
