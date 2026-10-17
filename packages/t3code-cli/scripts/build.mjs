// ---
// relationships:
//   implements: command-line
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeChildProcess from "node:child_process";
await NodeFSP.copyFile(
  new URL("../../../docs/specifications/assets/cli-surface.json", import.meta.url),
  new URL("../commandSurface.json", import.meta.url),
);
NodeChildProcess.execFileSync("pnpm", ["exec", "tsc", "-p", "tsconfig.build.json"], {
  stdio: "inherit",
});
await NodeFSP.chmod(new URL("../dist/cli.js", import.meta.url), 0o755);
