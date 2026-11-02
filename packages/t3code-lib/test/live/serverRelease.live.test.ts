// ---
// relationships:
//   verifies: library-facades
// ---
/**
 * Real server npm release lookup, triage session start, on-demand provider snapshots,
 * the secret reload input and the local-only VCS status.
 */
import * as NodeCP from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { T3RpcError } from "../../src/index.ts";
import { ServerConfigStreamEvent } from "../../src/schemas/server.ts";
import { TRIAGE_PROMPT_FILE_NAME } from "../../src/schemas/serverRelease.ts";
import { connect, hasLiveServer } from "./liveClient.ts";

describe.skipIf(!hasLiveServer)("live server release and on-demand inputs", () => {
  it("advertises the capabilities", async () => {
    const client = connect();
    try {
      const { capabilities } = await client.server.environment();
      expect(capabilities).toMatchObject({
        npmReleaseLookup: true,
        triage: true,
        providerWorkspaceSnapshotsOnDemand: true,
      });
    } finally {
      await client.close();
    }
  });

  it("finds a published release, or reports the typed lookup failure", async () => {
    const client = connect();
    try {
      const outcome = await client.server
        .getNpmRelease({ spec: "0.1.6" })
        .catch((error: unknown) => error);
      if (outcome instanceof T3RpcError) {
        expect(outcome.tag).toBe("ServerNpmReleaseError");
        console.log("Release lookup failure", outcome.tag);
      } else {
        expect(outcome).toMatchObject({ version: "0.1.6" });
        console.log("Release lookup", outcome);
      }
    } finally {
      await client.close();
    }
  });

  it("starts a triage session and returns a prompt that links its file", async () => {
    const client = connect();
    try {
      const { prompt } = await client.server.prepareTriage({
        client: { label: "Sample client", surface: "cli", deviceType: "bot" },
      });
      expect(prompt).toContain(TRIAGE_PROMPT_FILE_NAME);
    } finally {
      await client.close();
    }
  });

  it("serves provider snapshots on demand and leaves them out of the stream", async () => {
    const cwd = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-on-demand-"));
    const client = connect();
    const abort = new AbortController();
    try {
      const [provider] = await client.server.providers();
      if (provider === undefined) throw new Error("The server has no provider instance.");
      const { instanceId } = provider;

      const none = await client.server.refreshProviders({
        reloadSecrets: true,
        workspaceSnapshotsOnDemand: true,
        usageLimitsCommand: true,
      });
      expect(none.providers.length).toBeGreaterThan(0);
      for (const item of none.providers) expect(item.workspaceSnapshots).toBeUndefined();

      const own = await client.server.refreshProviders({
        instanceId,
        cwd,
        workspaceSnapshotsOnDemand: true,
      });
      expect(own.providers.map((item) => item.instanceId)).toEqual([instanceId]);
      expect(own.providers[0]).toMatchObject({ models: [], slashCommands: [], skills: [] });
      const snapshots = own.providers[0]?.workspaceSnapshots ?? [];
      console.log("On-demand snapshots", snapshots.length);
      for (const snapshot of snapshots) expect(snapshot.cwd).toBe(cwd);

      const firstSnapshot = async (workspaceSnapshotsOnDemand?: boolean) => {
        const options =
          workspaceSnapshotsOnDemand === undefined ? {} : { workspaceSnapshotsOnDemand };
        for await (const item of client.server.watchConfig({ ...options, signal: abort.signal })) {
          const event = ServerConfigStreamEvent.parse(item);
          if ("unknown" in event || event.type !== "snapshot") break;
          return event.config;
        }
        throw new Error("The first configuration item is not a snapshot.");
      };
      if (snapshots.length > 0) {
        const all = await firstSnapshot();
        const cwds = all.providers.flatMap((entry) =>
          (entry.workspaceSnapshots ?? []).map((snapshot) => snapshot.cwd),
        );
        expect(cwds).toContain(cwd);
      }
      const omitted = await firstSnapshot(true);
      expect(omitted.providers.length).toBeGreaterThan(0);
      for (const entry of omitted.providers) expect(entry.workspaceSnapshots).toBeUndefined();
    } finally {
      abort.abort();
      await client.close();
      await NodeFSP.rm(cwd, { recursive: true, force: true });
    }
  });

  it("refreshes only the local status", async () => {
    const cwd = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-local-status-"));
    const client = connect();
    try {
      NodeCP.execFileSync("git", ["init", "--initial-branch=main", cwd], { stdio: "pipe" });
      await NodeFSP.writeFile(NodePath.join(cwd, "sample.txt"), "sample\n");
      const status = await client.vcs.status({ cwd, localOnly: true });
      expect(status).toMatchObject({ isRepo: true, refName: "main", hasWorkingTreeChanges: true });
    } finally {
      await client.close();
      await NodeFSP.rm(cwd, { recursive: true, force: true });
    }
  });
});
