// ---
// relationships:
//   verifies: testing
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { verifyServerEvidence } from "../packages/t3code-cli/scripts/acceptanceEvidence.ts";

it("requires matching lifecycle identities, native process absence and home removal", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "sample-evidence-"));
  const identities = [
    { pid: 101, stat: "sample launcher identity", executable: "/sample/node" },
    { pid: 102, stat: "sample native identity", executable: "/sample/t3" },
  ];
  const phases = {
    started: { pid: 101 },
    ready: {
      pid: 101,
      root: "/sample/home",
      platform: "linux",
      serverVersion: "0.1.2",
      protocol: 2,
      ownedProcesses: identities,
    },
    stopped: {
      pid: 101,
      pidAbsent: true,
      ownedProcesses: identities.map((identity) => ({ ...identity, absent: true })),
    },
    cleanup: { root: "/sample/home", rootAbsent: true, kept: false },
  };
  const write = async (phase: string, value: unknown) =>
    NodeFSP.writeFile(NodePath.join(root, `sample-${phase}.json`), JSON.stringify(value));
  try {
    for (const [phase, value] of Object.entries(phases)) await write(phase, value);
    await verifyServerEvidence(root);
    for (const [phase, value] of [
      ["ready", { ...phases.ready, ownedProcesses: [identities[0]] }],
      ["started", { pid: 999 }],
      ["ready", { ...phases.ready, serverVersion: "0.2.0" }],
      ["ready", { ...phases.ready, protocol: 1 }],
      ["stopped", { ...phases.stopped, pid: 999 }],
      ["stopped", { ...phases.stopped, pidAbsent: false }],
      ["stopped", { ...phases.stopped, ownedProcesses: [{ ...identities[0], absent: true }] }],
      [
        "stopped",
        {
          ...phases.stopped,
          ownedProcesses: identities.map((identity) => ({
            ...identity,
            absent: identity.pid === 101,
          })),
        },
      ],
      ["cleanup", { ...phases.cleanup, root: "/other/home" }],
      ["cleanup", { ...phases.cleanup, rootAbsent: false }],
      ["cleanup", { ...phases.cleanup, kept: true }],
    ] as const) {
      await write(phase, value);
      await expect(verifyServerEvidence(root)).rejects.toThrow();
      await write(phase, phases[phase]);
    }
    await write("ready", { ...phases.ready, platform: "darwin", ownedProcesses: [] });
    await write("stopped", { ...phases.stopped, ownedProcesses: [] });
    await expect(verifyServerEvidence(root)).rejects.toThrow();
    await write("ready", phases.ready);
    await write("stopped", phases.stopped);
    // Both snapshots can agree on an incomplete roster; require the native server too.
    await write("ready", { ...phases.ready, ownedProcesses: [identities[0]] });
    await write("stopped", {
      ...phases.stopped,
      ownedProcesses: [{ ...identities[0], absent: true }],
    });
    await expect(verifyServerEvidence(root)).rejects.toThrow("Native server identity missing");
    await write("ready", phases.ready);
    await write("stopped", phases.stopped);
    await NodeFSP.writeFile(
      NodePath.join(root, "orphan-started.json"),
      JSON.stringify({ pid: 999 }),
    );
    await expect(verifyServerEvidence(root)).rejects.toThrow();
    await NodeFSP.rm(NodePath.join(root, "orphan-started.json"));
    await NodeFSP.rm(NodePath.join(root, "sample-stopped.json"));
    await expect(verifyServerEvidence(root)).rejects.toThrow();
    await NodeFSP.rm(NodePath.join(root, "sample-ready.json"));
    await expect(verifyServerEvidence(root)).rejects.toThrow("No owned server evidence");
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});
