// ---
// relationships:
//   implements: command-line
// ---
/**
 * Reads schedule create/update input before connecting: an optional JSON
 * object from --input, overridden by focused flags. Selections that need the
 * server (project path, provider, model and model options) stay separate.
 */
import * as NodeFSP from "node:fs/promises";
import {
  projectId,
  schemas,
  T3PreconditionError,
  threadId,
  type ScheduledTaskUpsertInput,
  type ScheduledTaskUpsertSchedule,
} from "@wyrd-company/t3code-lib";
import { durationMs } from "../options.ts";
import { defaultWorktreeBaseRef } from "../execution/workspace.ts";
import { parseModelOptions, type ModelOptionEntry } from "../execution/modelOptions.ts";

/** Fields a caller may supply; identity and provenance belong to the server and library. */
export const SCHEDULE_INPUT_KEYS = [
  "title",
  "prompt",
  "enabled",
  "schedule",
  "projectId",
  "threadId",
  "workspaceStrategy",
  "modelSelection",
  "runtimeMode",
  "interactionMode",
] as const;
type InputKey = (typeof SCHEDULE_INPUT_KEYS)[number];
export type ScheduleFields = Partial<Pick<ScheduledTaskUpsertInput, InputKey>>;

export interface ScheduleDraft {
  /** Supplied fields, from JSON input and value flags. */
  readonly fields: ScheduleFields;
  readonly projectPath?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly modelOptions: readonly ModelOptionEntry[];
  readonly clearModelOptions: boolean;
}

export type ReadSource = (path: string) => Promise<string>;

const MIN_INTERVAL_MS = schemas.scheduledTask.MIN_SCHEDULED_TASK_INTERVAL_MS;
const TIME_OF_DAY = /^([01]?\d|2[0-3]):([0-5]\d)$/u;
const STRING_OPTIONS = [
  "input",
  "title",
  "prompt",
  "promptFile",
  "at",
  "weekdays",
  "project",
  "projectPath",
  "thread",
  "provider",
  "model",
  "mode",
  "interactionMode",
  "existingWorktree",
  "baseRef",
  "branch",
] as const;

export async function readStdinOrFile(path: string): Promise<string> {
  if (path !== "-") return NodeFSP.readFile(path, "utf8");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export async function readScheduleDraft(
  options: Record<string, unknown>,
  read: ReadSource = readStdinOrFile,
): Promise<ScheduleDraft> {
  for (const key of STRING_OPTIONS) {
    const value = options[key];
    if (typeof value === "string" && !value.trim())
      throw new T3PreconditionError("Selection cannot be blank.");
  }
  const text = (key: string) => options[key] as string | undefined;
  if (text("input") === "-" && text("promptFile") === "-")
    throw new T3PreconditionError("Only one input can read stdin.");
  const fields = flagFields(options);
  const input = text("input") === undefined ? {} : jsonFields(await read(text("input")!));
  if (text("promptFile") !== undefined) {
    const prompt = await read(text("promptFile")!);
    if (!prompt.trim()) throw new T3PreconditionError("A prompt is required.");
    fields.prompt = prompt;
  }
  const merged = Object.fromEntries(
    Object.entries({ ...input, ...fields }).map(([key, value]) => [
      key,
      checkedField(key as InputKey, value),
    ]),
  ) as ScheduleFields;
  return {
    fields: merged,
    ...(text("projectPath") === undefined ? {} : { projectPath: text("projectPath")! }),
    ...(text("provider") === undefined ? {} : { provider: text("provider")! }),
    ...(text("model") === undefined ? {} : { model: text("model")! }),
    modelOptions: parseModelOptions(options["modelOption"] as string[] | undefined),
    clearModelOptions: options["clearModelOptions"] === true,
  };
}

function jsonFields(source: string): ScheduleFields {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new T3PreconditionError("Schedule input is not valid JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new T3PreconditionError("Schedule input must be a JSON object.");
  const unknown = Object.keys(value).filter(
    (key) => !(SCHEDULE_INPUT_KEYS as readonly string[]).includes(key),
  );
  if (unknown.length > 0)
    throw new T3PreconditionError(`Schedule input has unsupported fields: ${unknown.join(", ")}.`);
  return value as ScheduleFields;
}

/** Validate and normalize one field with the library's write schema without echoing its value. */
function checkedField(key: InputKey, value: unknown): unknown {
  const shape = schemas.scheduledTask.ScheduledTaskUpsertInput.shape;
  const parsed = shape[key].safeParse(value);
  if (value === undefined || !parsed.success)
    throw new T3PreconditionError(`Schedule input field ${key} is invalid.`);
  return parsed.data;
}

function flagFields(options: Record<string, unknown>): ScheduleFields {
  const fields: ScheduleFields = {};
  const text = (key: string) => options[key] as string | undefined;
  if (text("title") !== undefined) fields.title = text("title")!;
  if (text("prompt") !== undefined) fields.prompt = text("prompt")!;
  if (options["disabled"] === true) fields.enabled = false;
  const schedule = flagSchedule(options);
  if (schedule !== undefined) fields.schedule = schedule;
  if (text("project") !== undefined) fields.projectId = projectId(text("project")!);
  if (text("project") !== undefined && text("projectPath") !== undefined)
    throw new T3PreconditionError("Choose one project source.");
  if (text("thread") !== undefined && options["newThread"] === true)
    throw new T3PreconditionError("Choose --thread or --new-thread.");
  if (text("thread") !== undefined) fields.threadId = threadId(text("thread")!);
  if (options["newThread"] === true) fields.threadId = null;
  if (text("mode") !== undefined) fields.runtimeMode = text("mode")!;
  if (text("interactionMode") !== undefined) fields.interactionMode = text("interactionMode")!;
  const workspace = flagWorkspace(options);
  if (workspace !== undefined) fields.workspaceStrategy = workspace;
  return fields;
}

function flagSchedule(options: Record<string, unknown>): ScheduledTaskUpsertSchedule | undefined {
  const every = options["every"] as string | undefined;
  const at = options["at"] as string | undefined;
  const weekdays = options["weekdays"] as string | undefined;
  const webhook = options["webhook"] === true;
  if ([every !== undefined, at !== undefined, webhook].filter(Boolean).length > 1)
    throw new T3PreconditionError("Choose one of --every, --at or --webhook.");
  if (weekdays !== undefined && at === undefined)
    throw new T3PreconditionError("--weekdays requires --at.");
  if (every !== undefined) {
    const everyMs = durationMs(every);
    if (!Number.isSafeInteger(everyMs) || everyMs < MIN_INTERVAL_MS)
      throw new T3PreconditionError(
        "--every must be a whole number of milliseconds of at least 1m.",
      );
    return { type: "interval", everyMs };
  }
  if (at !== undefined) {
    if (!TIME_OF_DAY.test(at.trim())) throw new T3PreconditionError("--at must be HH:MM.");
    return {
      type: "fixed_time",
      timeOfDay: at.trim(),
      ...(weekdays === undefined ? {} : { weekdays: weekdayList(weekdays) }),
    };
  }
  return webhook ? { type: "webhook" } : undefined;
}

function weekdayList(value: string): number[] {
  const days = value.split(",").map((day) => day.trim());
  if (days.some((day) => !/^[0-6]$/u.test(day)))
    throw new T3PreconditionError("--weekdays must be comma-separated days from 0 to 6.");
  const unique = [...new Set(days.map(Number))];
  if (unique.length !== days.length)
    throw new T3PreconditionError("--weekdays lists a day more than once.");
  return unique.sort((left, right) => left - right);
}

function flagWorkspace(
  options: Record<string, unknown>,
): ScheduledTaskUpsertInput["workspaceStrategy"] | undefined {
  const worktree = options["worktree"] === true;
  const existing = options["existingWorktree"] as string | undefined;
  const root = options["root"] === true;
  if ([worktree, existing !== undefined, root].filter(Boolean).length > 1)
    throw new T3PreconditionError("Choose one of --worktree, --existing-worktree or --root.");
  const baseRef = options["baseRef"] as string | undefined;
  const branch = options["branch"] as string | undefined;
  const startFromOrigin = options["startFromOrigin"] as boolean | undefined;
  if (!worktree && (baseRef !== undefined || branch !== undefined || startFromOrigin !== undefined))
    throw new T3PreconditionError(
      "--base-ref, --branch and --start-from-origin require --worktree.",
    );
  if (worktree)
    return {
      type: "worktree",
      baseRef: baseRef ?? defaultWorktreeBaseRef,
      ...(branch === undefined ? {} : { branch }),
      ...(startFromOrigin === undefined ? {} : { startFromOrigin }),
    };
  if (existing !== undefined) return { type: "existing_worktree", worktreePath: existing };
  return root ? { type: "root" } : undefined;
}
