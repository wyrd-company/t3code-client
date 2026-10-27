// ---
// relationships:
//   verifies: command-line
//   references: testing, automation-capabilities
// ---
import * as NodePath from "node:path";
import { schemas, type ModelSelection, type T3Client } from "@wyrd-company/t3code-lib";

type Provider = Awaited<ReturnType<T3Client["server"]["providers"]>>[number];
const fixtureInstance = "sample-validation";

/** Match the runtime's selectable catalog; installation and auth remain diagnostics. */
function advertisedSelection(providers: readonly Provider[]): ModelSelection | undefined {
  const provider = providers.find(
    (entry) => entry.enabled && entry.availability !== "unavailable" && entry.models.length > 0,
  );
  const model = provider?.models.find((entry) => entry.isDefault) ?? provider?.models[0];
  return provider && model ? { instanceId: provider.instanceId, model: model.slug } : undefined;
}

function requireOwnedServer(env: NodeJS.ProcessEnv): void {
  const home = env["T3_LIVE_HOME"];
  const root = home === undefined ? "" : NodePath.dirname(home);
  let loopback = false;
  try {
    loopback = new URL(env["T3_LIVE_URL"] ?? "").hostname === "127.0.0.1";
  } catch {
    /* No selected owned server. */
  }
  if (
    !home ||
    !NodePath.isAbsolute(home) ||
    NodePath.basename(home) !== "home" ||
    !NodePath.basename(root).startsWith("t3code-lib-live-") ||
    env["T3_LIVE_WORKSPACE"] !== NodePath.join(root, "workspace") ||
    !loopback
  )
    throw new Error("No advertised model; custom model seeding requires an owned live server.");
}

/**
 * Select a real advertised model for NOAGENT checks. If the host has no provider
 * installations, seed a separate custom-model instance only in the fresh owned
 * server. The privileged issuer performs setup; commands still use their normal
 * paired profile. Agent-turn acceptance must continue selecting Luna explicitly.
 */
export async function liveCatalogSelection(
  issuer: T3Client,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ModelSelection> {
  const existing = advertisedSelection(await issuer.server.providers());
  if (existing) return existing;
  requireOwnedServer(env);
  // Supported stock settings operation; this test fixture does not change a runtime API.
  await issuer.rpc.callRaw("server.updateSettings", {
    patch: {},
    providerInstanceMutation: {
      operation: "create",
      instanceId: fixtureInstance,
      instance: {
        driver: "codex",
        enabled: true,
        config: {
          binaryPath: "/sample/missing-codex",
          customModels: ["sample-catalog-model"],
        },
      },
    },
  });
  // Subscribe after the save: its initial snapshot also covers an already-published update.
  // Ten seconds bounds fixture setup, including registry advertisement, not a user action.
  for await (const event of issuer.server.watchConfig({ signal: AbortSignal.timeout(10_000) })) {
    if (schemas.common.isUnknownVariant<"type">(event)) continue;
    if (!("type" in event)) throw event.error;
    const providers =
      event.type === "snapshot"
        ? event.config.providers
        : event.type === "providerStatuses"
          ? event.payload.providers
          : undefined;
    if (!providers) continue;
    const selected = advertisedSelection(
      providers.filter((provider) => provider.instanceId === fixtureInstance),
    );
    if (selected) return selected;
  }
  throw new Error("The owned custom model was not advertised.");
}
