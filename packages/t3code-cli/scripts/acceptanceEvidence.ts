// ---
// relationships:
//   verifies: testing
// ---
import assert from "node:assert/strict";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

/** A successful acceptance must prove the actual native server and launcher ended. */
export async function verifyServerEvidence(directory: string) {
  const names = await NodeFSP.readdir(directory);
  const ready = names.filter((name) => name.endsWith("-ready.json"));
  assert(ready.length > 0, "No owned server evidence.");
  for (const name of ready) {
    const read = async (phase: string) =>
      JSON.parse(
        await NodeFSP.readFile(
          NodePath.join(directory, name.replace("-ready.json", `-${phase}.json`)),
          "utf8",
        ),
      );
    const start = await read("started");
    const server = await read("ready");
    const stop = await read("stopped");
    const cleanup = await read("cleanup");
    assert.equal(start.pid, server.pid);
    assert.equal(stop.pid, server.pid);
    assert.equal(cleanup.root, server.root);
    assert.equal(server.serverVersion, "0.1.0");
    assert.equal(server.protocol, 2);
    assert.equal(stop.pidAbsent, true);
    assert.equal(cleanup.rootAbsent, true);
    assert.equal(cleanup.kept, false);
    assert(server.ownedProcesses.length > 0);
    if (server.platform === "linux")
      assert(
        server.ownedProcesses.some(
          (identity: { executable: string | null }) =>
            identity.executable !== null && NodePath.basename(identity.executable) === "t3",
        ),
        "Native server identity missing.",
      );
    assert.deepEqual(
      stop.ownedProcesses.map(
        ({
          absent: _absent,
          ...identity
        }: {
          absent: boolean;
          pid: number;
          stat: string | null;
          executable: string | null;
        }) => identity,
      ),
      server.ownedProcesses,
    );
    assert(stop.ownedProcesses.every((identity: { absent: boolean }) => identity.absent === true));
  }
}
