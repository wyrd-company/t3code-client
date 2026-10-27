// ---
// relationships:
//   implements: command-line
// ---
import { T3PreconditionError, type ModelSelection, type T3Client } from "@wyrd-company/t3code-lib";

type ServerProvider = Awaited<ReturnType<T3Client["server"]["providers"]>>[number];
type ServerModel = ServerProvider["models"][number];
type OptionSelection = NonNullable<ModelSelection["options"]>[number];
type Descriptor = NonNullable<
  NonNullable<ServerModel["capabilities"]>["optionDescriptors"]
>[number];
type UnknownDescriptor = Extract<Descriptor, { readonly unknown: true }>;

/** Growing descriptor types decode as `{ unknown: true, raw }`. */
function isUnknownDescriptor(descriptor: Descriptor): descriptor is UnknownDescriptor {
  return (descriptor as { unknown?: unknown }).unknown === true;
}

export interface ModelOptionInput {
  modelOption?: string[];
  clearModelOptions?: boolean;
}

export interface ModelOptionEntry {
  readonly id: string;
  readonly raw: string;
}

/** Parse repeatable `key=value` entries before any server call. */
export function parseModelOptions(entries: readonly string[] | undefined): ModelOptionEntry[] {
  const parsed: ModelOptionEntry[] = [];
  for (const entry of entries ?? []) {
    const split = entry.indexOf("=");
    const id = split < 0 ? "" : entry.slice(0, split).trim();
    const raw = split < 0 ? "" : entry.slice(split + 1).trim();
    if (!id || !raw) throw new T3PreconditionError("Model option must be key=value.");
    if (parsed.some((known) => known.id === id))
      throw new T3PreconditionError(`Model option ${id} is repeated.`);
    parsed.push({ id, raw });
  }
  return parsed;
}

export function changesModelOptions(input: ModelOptionInput): boolean {
  return input.clearModelOptions === true || (input.modelOption?.length ?? 0) > 0;
}

/** Convert one entry with the live model's advertised descriptor. */
function selectionFor(model: ServerModel, entry: ModelOptionEntry): OptionSelection {
  const descriptor = (model.capabilities?.optionDescriptors ?? []).find((candidate) =>
    isUnknownDescriptor(candidate) ? candidate.raw["id"] === entry.id : candidate.id === entry.id,
  );
  if (descriptor === undefined)
    throw new T3PreconditionError(`Model option ${entry.id} is not advertised.`);
  // A growing descriptor type has no advertised value contract to validate against.
  if (isUnknownDescriptor(descriptor))
    throw new T3PreconditionError(`Model option ${entry.id} has an unsupported type.`);
  if (descriptor.type === "boolean") {
    if (entry.raw !== "true" && entry.raw !== "false")
      throw new T3PreconditionError(`Model option ${entry.id} accepts true or false.`);
    return { id: entry.id, value: entry.raw === "true" };
  }
  // Upstream packages/shared/src/model.ts: a select without choices is free-form.
  if (
    descriptor.options.length > 0 &&
    !descriptor.options.some((choice) => choice.id === entry.raw)
  )
    throw new T3PreconditionError(`Model option ${entry.id} has no choice ${entry.raw}.`);
  return { id: entry.id, value: entry.raw };
}

/**
 * Apply explicit entries over inherited options. Clearing starts empty. The
 * result is undefined when the caller supplied no option input.
 */
export function resolveModelOptions(
  model: ServerModel,
  input: ModelOptionInput,
  inherited: ModelSelection["options"],
): OptionSelection[] | undefined {
  if (!changesModelOptions(input)) return undefined;
  const explicit = parseModelOptions(input.modelOption).map((entry) => selectionFor(model, entry));
  const base = input.clearModelOptions === true ? [] : (inherited ?? []);
  return [
    ...base.filter((option) => !explicit.some((entry) => entry.id === option.id)),
    ...explicit,
  ];
}
