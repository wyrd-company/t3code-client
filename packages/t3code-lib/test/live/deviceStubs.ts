// ---
// relationships:
//   implements: library-testing
// ---
/**
 * What stands in for a device host in the device live test: a local gateway for a Simlock
 * pool, and a stub `ssh` for a remote host. No real account or machine is in reach of them.
 */
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { startLocalHttp, type LocalHttp } from "./localHttp.ts";

export const SAMPLE_TOKEN = "sample-agent-token";
export const SAMPLE_MODEL = "Sample Phone";

const DEVICE_TOOLS = ["adb", "emulator", "avdmanager", "xcrun", "simctl"];

/** A `PATH` with `bin` first and no folder of this machine that holds a device tool. */
export function pathWithoutDeviceTools(parent: string, bin: string): string {
  const kept = parent
    .split(NodePath.delimiter)
    .filter((dir) => !DEVICE_TOOLS.some((tool) => NodeFS.existsSync(NodePath.join(dir, tool))));
  return [bin, ...kept].join(NodePath.delimiter);
}

const probeOutput = JSON.stringify({
  nodePath: "/usr/bin/node",
  platforms: [{ platform: "android", available: true }],
});

/** Writes an `ssh` in `bin` that answers the server's host probe. */
export async function writeStubSsh(bin: string): Promise<void> {
  await NodeFSP.mkdir(bin);
  await NodeFSP.writeFile(
    NodePath.join(bin, "ssh"),
    `#!/bin/sh\ncat >/dev/null\nprintf '%s\\n' '${probeOutput}'\n`,
    { mode: 0o755 },
  );
}

/** Sets `values` in this process, and returns what restores them. */
export function withInherited(values: Readonly<Record<string, string>>): () => void {
  const saved = Object.keys(values).map((name) => [name, process.env[name]] as const);
  Object.assign(process.env, values);
  return () => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

/** Answers the two read routes of a Simlock gateway, and refuses any other credential. */
export function startGateway(): Promise<LocalHttp> {
  const answers: Record<string, unknown> = {
    "/v1/identity": { name: "sample-agent", role: "agent" },
    "/v1/catalog": {
      platforms: [{ platform: "android", modelRuntimes: { [SAMPLE_MODEL]: ["android-35"] } }],
    },
  };
  return startLocalHttp((request, response) => {
    const answer = answers[request.url ?? ""];
    const allowed = request.headers.authorization === `Bearer ${SAMPLE_TOKEN}`;
    response.writeHead(!allowed ? 401 : answer === undefined ? 404 : 200, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify(allowed && answer !== undefined ? answer : {}));
  });
}
