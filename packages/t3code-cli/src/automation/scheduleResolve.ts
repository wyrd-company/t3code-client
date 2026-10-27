// ---
// relationships:
//   implements: command-line
// ---
/**
 * Resolves schedule selections against the server before any scheduler
 * mutation: project, thread, live catalog model, model options and defaults.
 */
import {
  schemas,
  T3PreconditionError,
  type ModelSelection,
  type ScheduledTask,
  type ScheduledTaskPatch,
  type ScheduledTaskUpsertInput,
  type T3Client,
} from "@wyrd-company/t3code-lib";
import { missingResource, selectModel, selectProject } from "../execution/selection.ts";
import { resolveModelOptions } from "../execution/modelOptions.ts";
import { selectWorkspace } from "../execution/workspace.ts";
import type { ScheduleDraft } from "./scheduleInput.ts";

/** Local checks that need no server: create's required fields. */
export function checkCreateDraft(draft: ScheduleDraft): void {
  const missing = (["title", "prompt", "schedule"] as const).filter(
    (key) => draft.fields[key] === undefined,
  );
  if (missing.length > 0)
    throw new T3PreconditionError(`Schedule create needs ${missing.join(", ")}.`);
}

export function checkUpdateDraft(draft: ScheduleDraft): void {
  const changes =
    Object.keys(draft.fields).length +
    Number(draft.projectPath !== undefined) +
    Number(draft.provider !== undefined || draft.model !== undefined) +
    draft.modelOptions.length +
    Number(draft.clearModelOptions);
  if (changes === 0) throw new T3PreconditionError("Supply at least one change.");
}

export async function resolveCreate(
  client: T3Client,
  draft: ScheduleDraft,
): Promise<ScheduledTaskUpsertInput> {
  const { fields } = draft;
  const thread =
    typeof fields.threadId === "string" ? await client.threads.get(fields.threadId) : undefined;
  if (typeof fields.threadId === "string" && thread === undefined) throw missingResource("thread");
  const project =
    fields.projectId === undefined && draft.projectPath === undefined && thread !== undefined
      ? await client.projects.get(thread.projectId)
      : await selectProject(client, {
          ...(fields.projectId === undefined || draft.projectPath !== undefined
            ? {}
            : { project: fields.projectId }),
          ...(draft.projectPath === undefined ? {} : { projectPath: draft.projectPath }),
        });
  if (!project) throw missingResource("project");
  const [config, settings] = await Promise.all([
    client.server.getConfig(),
    client.server.getSettings(),
  ]);
  const base = selectModel(
    config.providers,
    {
      ...(draft.provider === undefined ? {} : { provider: draft.provider }),
      ...(draft.model === undefined ? {} : { model: draft.model }),
    },
    fields.modelSelection ?? thread?.modelSelection ?? project.defaultModelSelection,
    settings["defaultModelSelection"],
  );
  const runtimeMode = fields.runtimeMode ?? defaultRuntimeMode(settings["defaultRuntimeMode"]);
  if (runtimeMode === undefined)
    throw new T3PreconditionError("Select a runtime mode with --mode.");
  const input: ScheduledTaskUpsertInput = {
    title: fields.title!,
    prompt: fields.prompt!,
    enabled: fields.enabled ?? true,
    schedule: fields.schedule!,
    projectId: project.id,
    ...(fields.threadId === undefined ? {} : { threadId: fields.threadId }),
    workspaceStrategy: (await resolveWorkspace(client, project, fields.workspaceStrategy)) ?? {
      type: "root",
    },
    modelSelection: withOptions(config.providers, base, draft),
    runtimeMode,
    interactionMode: fields.interactionMode ?? "default",
  };
  if (!schemas.scheduledTask.ScheduledTaskUpsertInput.safeParse(input).success)
    throw new T3PreconditionError("The resolved schedule is invalid.");
  return input;
}

/**
 * The patch `ScheduledTasksApi.update` applies. Only supplied fields are set;
 * the library keeps every omitted setting.
 */
export async function resolveUpdate(
  client: T3Client,
  id: ScheduledTask["id"],
  draft: ScheduleDraft,
): Promise<ScheduledTaskPatch> {
  const patch: ScheduledTaskPatch = { ...draft.fields };
  if (typeof patch.threadId === "string" && !(await client.threads.get(patch.threadId)))
    throw missingResource("thread");
  if (draft.projectPath !== undefined)
    patch.projectId = (await selectProject(client, { projectPath: draft.projectPath })).id;
  else if (patch.projectId !== undefined && !(await client.projects.get(patch.projectId)))
    throw missingResource("project");
  const choosing = draft.provider !== undefined || draft.model !== undefined;
  if (
    patch.modelSelection !== undefined ||
    choosing ||
    draft.modelOptions.length > 0 ||
    draft.clearModelOptions
  ) {
    const stored = patch.modelSelection ?? (await client.scheduledTasks.get(id))?.modelSelection;
    if (stored === undefined) throw missingResource("scheduled task");
    const providers = (await client.server.getConfig()).providers;
    const base = selectModel(
      providers,
      {
        ...(draft.provider === undefined ? {} : { provider: draft.provider }),
        ...(draft.model === undefined ? {} : { model: draft.model }),
      },
      stored,
      undefined,
    );
    patch.modelSelection = withOptions(providers, base, draft);
  }
  if (patch.workspaceStrategy?.type === "existing_worktree") {
    const projectId = patch.projectId ?? (await client.scheduledTasks.get(id))?.projectId;
    const project = projectId === undefined ? undefined : await client.projects.get(projectId);
    if (!project) throw missingResource("project");
    patch.workspaceStrategy = (await resolveWorkspace(client, project, patch.workspaceStrategy))!;
  }
  return patch;
}

function withOptions(
  providers: Awaited<ReturnType<T3Client["server"]["providers"]>>,
  selection: ModelSelection,
  draft: ScheduleDraft,
): ModelSelection {
  const model = providers
    .find((provider) => provider.instanceId === selection.instanceId)
    ?.models.find(
      (model) => model.slug === selection.model || model.aliases?.includes(selection.model),
    );
  const supplied = draft.fields.modelSelection;
  const jsonOptions =
    !draft.clearModelOptions &&
    supplied?.instanceId === selection.instanceId &&
    (supplied.model === selection.model || model?.aliases?.includes(supplied.model))
      ? supplied.options
      : undefined;
  if (draft.modelOptions.length === 0 && !draft.clearModelOptions && jsonOptions === undefined)
    return selection;
  if (model === undefined) throw missingResource("model");
  return {
    ...selection,
    options: resolveModelOptions(
      model,
      {
        modelOption: [
          ...(jsonOptions ?? [])
            .filter((entry) => !draft.modelOptions.some((flag) => flag.id === entry.id))
            .map((entry) => `${entry.id}=${entry.value}`),
          ...draft.modelOptions.map((entry) => `${entry.id}=${entry.raw}`),
        ],
        clearModelOptions: draft.clearModelOptions,
      },
      selection.options,
    )!,
  };
}

function defaultRuntimeMode(advertised: unknown): string | undefined {
  if (advertised == null) return undefined;
  const parsed = schemas.orchestrationModel.RuntimeMode.safeParse(advertised);
  return parsed.success ? parsed.data : undefined;
}

async function resolveWorkspace(
  client: T3Client,
  project: Awaited<ReturnType<T3Client["projects"]["list"]>>[number],
  strategy: ScheduledTaskUpsertInput["workspaceStrategy"] | undefined,
): Promise<ScheduledTaskUpsertInput["workspaceStrategy"] | undefined> {
  if (strategy?.type !== "existing_worktree") return strategy;
  return selectWorkspace(client, project, { existingWorktree: strategy.worktreePath });
}
