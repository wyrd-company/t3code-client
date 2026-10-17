// ---
// relationships:
//   implements: command-line
//   references: profiles
// ---
import { T3Client, type ResolvedProfile, grantedScopes } from "@wyrd-company/t3code-lib";
import type { Invocation } from "./context.ts";
import { exitCodeFor, failureFor, type CliFailure, type ExitCode } from "./errors.ts";
import { durationMs } from "./options.ts";

interface Probe {
  reachable: boolean;
  authenticated: boolean;
  label: string | null;
  scopes: readonly string[] | null;
  expiresAt: string | null;
  exitCode: ExitCode;
  error?: CliFailure;
}

/** Saved profiles always use exact names; overrides affect only the effective probe. */
export async function authStatus(invocation: Invocation): Promise<void> {
  const current = (await invocation.profiles.getCurrent())?.name ?? null;
  const profiles = [];
  for (const profile of await invocation.profiles.list()) {
    let result: Probe;
    try {
      result = await probe(await invocation.profiles.resolveProfile(profile.name), invocation);
    } catch (error) {
      result = failed(error);
    }
    profiles.push({ ...profile, current: profile.name === current, ...result });
  }
  const override =
    invocation.options.server !== undefined ||
    invocation.options.credentials !== undefined ||
    Boolean(process.env["T3_SERVER_URL"]?.trim()) ||
    Boolean(process.env["T3_TOKEN"]?.trim());
  let effective:
    | (Probe & { url: string | null; sources: ResolvedProfile["sources"] | null })
    | null = null;
  if (current !== null || override) {
    try {
      const resolved = await invocation.resolve();
      effective = {
        url: resolved.baseUrl,
        sources: resolved.sources,
        ...(await probe(resolved, invocation)),
      };
    } catch (error) {
      effective = { url: null, sources: null, ...failed(error) };
    }
  }
  const selected = override ? effective : profiles.find((profile) => profile.current);
  const exitCode = selected?.exitCode ?? 0;
  const data = { profiles, current, effective };
  const lines = [
    "CURRENT\tNAME\tURL\tLABEL\tSCOPES\tEXPIRY\tSTATUS",
    ...profiles.map((profile) =>
      [
        profile.current ? "*" : "",
        profile.name,
        profile.url,
        profile.label ?? "-",
        profile.scopes?.join(",") ?? "-",
        profile.expiresAt ?? "-",
        profile.error?.code ?? "authenticated",
      ].join("\t"),
    ),
  ];
  lines.push(
    effective === null
      ? "Effective: none"
      : `Effective: ${effective.url} (server: ${effective.sources?.server ?? "unresolved"}, credentials: ${effective.sources?.credentials ?? "unresolved"})`,
  );
  invocation.output.finish(
    { data, exitCode, ...(selected?.error ? { error: selected.error } : {}) },
    lines.join("\n"),
  );
}

async function probe(resolved: ResolvedProfile, invocation: Invocation): Promise<Probe> {
  const result: Probe = {
    reachable: false,
    authenticated: false,
    label: null,
    scopes: null,
    expiresAt: null,
    exitCode: 0,
  };
  const client = T3Client.create({
    ...resolved,
    openTimeoutMs: durationMs(invocation.options.connectTimeout ?? "30s"),
    clientLabel: "t3c",
  });
  try {
    const descriptor = await client.auth.descriptor();
    result.reachable = true;
    result.label = descriptor.label;
    const state = await client.auth.sessionState();
    result.authenticated = state.authenticated;
    result.scopes = grantedScopes(state);
    result.expiresAt = state.expiresAt ?? null;
    if (state.expiresAt !== undefined && Date.parse(state.expiresAt) <= Date.now()) {
      result.exitCode = 9;
      result.error = { code: "expired", message: "Credential expired." };
    } else if (!state.authenticated) {
      result.exitCode = 9;
      result.error = {
        code: "auth_invalid",
        message: "Credential rejected or required scope missing.",
      };
    }
    return result;
  } catch (error) {
    return {
      ...result,
      exitCode: exitCodeFor(error, "connection"),
      error: failureFor(error, "connection"),
    };
  } finally {
    await client.close();
  }
}
function failed(error: unknown): Probe {
  return {
    reachable: false,
    authenticated: false,
    label: null,
    scopes: null,
    expiresAt: null,
    exitCode: exitCodeFor(error, "local"),
    error: failureFor(error, "local"),
  };
}
