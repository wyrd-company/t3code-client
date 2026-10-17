// ---
// relationships:
//   implements: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeModule from "node:module";
import { TARGET_T3_CODE_VERSION, T3PreconditionError } from "@wyrd-company/t3code-lib";
import { compare, valid } from "semver";
import type { Invocation } from "./context.ts";
import { exitCodeFor, failureFor } from "./errors.ts";

export async function packageVersions(): Promise<{ cli: string; library: string }> {
  const require = NodeModule.createRequire(import.meta.url);
  const cli = JSON.parse(
    await NodeFSP.readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  const library = JSON.parse(
    await NodeFSP.readFile(require.resolve("@wyrd-company/t3code-lib/package.json"), "utf8"),
  ) as { version: string };
  return { cli: cli.version, library: library.version };
}
export function versionVerdict(server: string): "match" | "newer" | "older" | null {
  if (!valid(server)) return null;
  const order = compare(server, TARGET_T3_CODE_VERSION);
  return order === 0 ? "match" : order > 0 ? "newer" : "older";
}
export async function reportVersion(invocation: Invocation): Promise<void> {
  const versions = await packageVersions();
  const data: Record<string, unknown> = {
    ...versions,
    target: TARGET_T3_CODE_VERSION,
    server: null,
    sources: null,
  };
  try {
    const resolved = await invocation.resolve();
    data["sources"] = resolved.sources;
    data["url"] = resolved.baseUrl;
  } catch (error) {
    // A fresh installation can report its versions without a selected server.
    if (
      !(error instanceof T3PreconditionError) ||
      (await invocation.profiles.getCurrent()) !== undefined ||
      invocation.options.server !== undefined ||
      process.env["T3_SERVER_URL"]?.trim()
    )
      throw error;
    invocation.output.finish({ data, exitCode: 0 }, format(data));
    return;
  }
  try {
    const client = await invocation.client();
    const descriptor = await client.auth.descriptor();
    data["server"] = {
      version: descriptor.serverVersion,
      protocol: descriptor.orchestrationProtocolVersion ?? null,
      verdict: versionVerdict(descriptor.serverVersion),
    };
    invocation.output.finish({ data, exitCode: 0 }, format(data));
  } catch (error) {
    const code = exitCodeFor(error, invocation.errorContext);
    if (code !== 8) throw error;
    data["unreachable"] = failureFor(error, invocation.errorContext);
    invocation.output.finish({ data, exitCode: 0 }, format(data));
  }
}
function format(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`,
    )
    .join("\n");
}
