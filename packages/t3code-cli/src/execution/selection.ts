// ---
// relationships:
//   implements: command-contract
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

type ServerProvider = Awaited<ReturnType<T3Client["server"]["providers"]>>[number];

export interface DispatchOptions {
  project?: string;
  projectPath?: string;
  provider?: string;
  model?: string;
  mode?: string;
  title?: string;
  worktree?: boolean;
  baseRef?: string;
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
  if (options.baseRef !== undefined && !options.worktree)
    throw new T3PreconditionError("Base ref requires worktree.");
  if (
    options.thread !== undefined &&
    (options.project !== undefined ||
      options.projectPath !== undefined ||
      options.worktree ||
      options.baseRef !== undefined)
  )
    throw new T3PreconditionError("Continuation retains the existing workspace.");
  for (const value of [
    options.project,
    options.provider,
    options.model,
    options.mode,
    options.title,
    options.baseRef,
    options.thread,
  ])
    if (value !== undefined && !value.trim())
      throw new T3PreconditionError("Selection cannot be blank.");
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

/** Resolve only live catalog entries, including custom models and aliases. */
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
  if (
    !provider.enabled ||
    !provider.installed ||
    provider.availability === "unavailable" ||
    provider.status === "disabled"
  )
    throw missingResource("provider");
  return {
    instanceId: provider.instanceId,
    model: candidate.slug,
    ...(fallback?.instanceId === provider.instanceId &&
    fallback.model === candidate.slug &&
    fallback.options !== undefined
      ? { options: fallback.options }
      : {}),
  };
}
