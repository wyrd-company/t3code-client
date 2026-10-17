#!/usr/bin/env node
// ---
// relationships:
//   implements: command-line
// ---
// Check before loading commander or the library on an unsupported Node runtime.
const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 16)) {
  process.stderr.write("t3c: requires Node >=22.16.\n");
  process.exitCode = 2;
} else {
  const NodeFS = await import("node:fs");
  const { authHandlers } = await import("./auth.ts");
  const { main } = await import("./main.ts");
  const surface = JSON.parse(
    NodeFS.readFileSync(new URL("../commandSurface.json", import.meta.url), "utf8"),
  ) as import("./registration.ts").CommandSurface;
  process.exitCode = await main(
    process.argv.slice(2),
    surface,
    {
      stdout: (text) => {
        process.stdout.write(text);
      },
      stderr: (text) => {
        process.stderr.write(text);
      },
    },
    authHandlers,
  );
}
