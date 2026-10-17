// ---
// relationships:
//   verifies: command-line
//   references: testing
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import setupServer from "../../../t3code-lib/test/live/globalSetup.ts";

/** Ordinary live tests preserve the library's explicit external-server mode. */
export default async function setup() {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3c-cli-config-"));
  process.env["T3C_CONFIG_HOME"] = root;
  try {
    const teardown = await setupServer();
    return async () => {
      try {
        await teardown?.();
      } finally {
        await NodeFSP.rm(root, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await NodeFSP.rm(root, { recursive: true, force: true });
    throw error;
  }
}
