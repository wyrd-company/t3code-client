// ---
// relationships:
//   implements: command-line
// ---
import type { T3Client } from "@wyrd-company/t3code-lib";
import type { InvocationHandler } from "../../main.ts";

type Environment = Awaited<ReturnType<T3Client["server"]["environment"]>>;
type ServerProvider = Awaited<ReturnType<T3Client["server"]["providers"]>>[number];
type ServerModel = ServerProvider["models"][number];
type Descriptor = NonNullable<
  NonNullable<ServerModel["capabilities"]>["optionDescriptors"]
>[number];

function environmentLines(environment: Environment): string[] {
  const { platform } = environment;
  const capabilities = Object.entries(environment.capabilities ?? {});
  const disabled = capabilities.filter(([, value]) => value === false).map(([name]) => name);
  const protocol = environment.orchestrationProtocolVersion ?? "-";
  return [
    `server\t${environment.label}\t${environment.serverVersion}\tprotocol ${protocol}`,
    `environment\t${environment.environmentId}`,
    `platform\t${platform.os}\t${platform.arch}${platform.machine ? `\t${platform.machine}` : ""}`,
    ...(environment.databaseMigration === undefined
      ? []
      : [`database\tmigration ${environment.databaseMigration}`]),
    `capabilities\t${capabilities.length - disabled.length} of ${capabilities.length} enabled${
      disabled.length > 0 ? `\tdisabled ${disabled.join(" ")}` : ""
    }`,
  ];
}

/** Growing descriptor types decode as `{ unknown: true, raw }`. */
function optionLine(descriptor: Descriptor): string {
  const unknown = descriptor as { unknown?: unknown; raw?: Record<string, unknown> };
  if (unknown.unknown === true) return `    option\t${String(unknown.raw?.["id"])}\tunsupported`;
  const known = descriptor as Exclude<Descriptor, { readonly unknown: true }>;
  if (known.type === "boolean") return `    option\t${known.id}\ttrue|false`;
  const choices = known.options.map((choice) => `${choice.id}${choice.isDefault ? "*" : ""}`);
  return `    option\t${known.id}\t${choices.length > 0 ? choices.join("|") : "any"}`;
}

function modelLines(model: ServerModel): string[] {
  const marks = [model.isDefault ? "default" : "", model.isLegacy ? "legacy" : ""].filter(Boolean);
  return [
    `  model\t${model.slug}\t${model.name}${marks.length > 0 ? `\t${marks.join(" ")}` : ""}`,
    ...(model.capabilities?.optionDescriptors ?? []).map(optionLine),
  ];
}

function providerLines(provider: ServerProvider): string[] {
  const state = [provider.status, provider.enabled ? "enabled" : "disabled"];
  if (!provider.installed) state.push("not installed");
  const reason = provider.unavailableReason ?? provider.message;
  return [
    `provider\t${provider.instanceId}\t${provider.driver}\t${state.join(" ")}\t${provider.version ?? "-"}\t${provider.displayName ?? provider.instanceId}`,
    ...(reason ? [`  message\t${reason}`] : []),
    `  auth\t${provider.auth.status}`,
    ...provider.models.flatMap(modelLines),
    ...(provider.updateRequiredModels ?? []).map(
      (model) => `  model\t${model.slug}\t${model.name}\tneeds version ${model.minVersion}`,
    ),
  ];
}

/** Readable server details and the live provider catalog with selectable ids. */
export function serverInfoText(environment: Environment, providers: readonly ServerProvider[]) {
  return [...environmentLines(environment), ...providers.flatMap(providerLines)].join("\n");
}

export const serverInfo: InvocationHandler = async (_, _command, invocation) => {
  const client = await invocation.client();
  const [environment, providers] = await Promise.all([
    client.server.environment(),
    client.server.providers(),
  ]);
  invocation.output.finish(
    { data: { environment, providers }, exitCode: 0 },
    serverInfoText(environment, providers),
  );
};
