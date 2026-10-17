// ---
// relationships:
//   verifies: command-line
//   references: profiles
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";

it("contains stdout stderr and evidence at the actual capture boundary", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "demo-capture-fixture-"));
  // These are inert fixture markers. No test server or real credential is used.
  const markers = ["sample-pair-value", "sample-issued-value", "sample-profile-value"];
  const capture = new URL("../../packages/t3code-cli/scripts/demoCapture.mjs", import.meta.url)
    .href;
  const fakeLibrary = `
    export class ProfileManager { async resolve() { return {
      profile: { name: "demo" }, baseUrl: "http://127.0.0.1:3000",
      sources: { server: "profile", credentials: "profile" },
      credentials: { async load() { return { accessToken: "sample-profile-value" }; } }
    }; } }
    export const T3Client = { create() { return {
      auth: { async sessionState() { return { authenticated: true }; } }, async close() {}
    }; } };
    export const threadId = value => value;
  `;
  try {
    await NodeFSP.writeFile(`${root}/secrets.json`, JSON.stringify(markers.slice(0, 2)));
    await NodeFSP.writeFile(
      `${root}/fixture.mjs`,
      `process.stdout.write("sample-pair-");
       process.stdout.write("value\\nHELLO\\n");
       process.stderr.write("sample-issued-value sample-profile-value\\n");`,
    );
    await NodeFSP.writeFile(
      `${root}/loader.mjs`,
      `import { registerHooks } from "node:module";
       registerHooks({ resolve(specifier, context, next) {
         return specifier === "@wyrd-company/t3code-lib"
           ? { url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(fakeLibrary)}`)}, shortCircuit: true }
           : next(specifier, context);
       } });`,
    );
    await NodeFSP.writeFile(
      `${root}/invoke.mjs`,
      `const { captureDemoCommand } = await import(${JSON.stringify(capture)});
       await captureDemoCommand(${JSON.stringify(`${root}/fixture.mjs`)}, ${JSON.stringify(root)}, ["project", "list"]);`,
    );
    const result = NodeChildProcess.spawnSync(
      process.execPath,
      ["--import", `${root}/loader.mjs`, `${root}/invoke.mjs`],
      { env: { ...process.env, T3C_CONFIG_HOME: `${root}/config` }, encoding: "utf8" },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout, "stdout must be sanitized before forwarding").toBe("[redacted]\nHELLO\n");
    expect(result.stderr, "stderr must be sanitized before forwarding").toBe(
      "[redacted] [redacted]\n",
    );
    const evidence = await NodeFSP.readFile(`${root}/commands.jsonl`, "utf8");
    const row = JSON.parse(evidence);
    expect(row.command).toEqual(["project", "list"]);
    expect(row.exitCode).toBe(0);
    expect(row.stdout).toBe(result.stdout);
    expect(row.stderr).toBe(result.stderr);
    for (const marker of markers)
      expect(evidence, "retained evidence must be sanitized").not.toContain(marker);
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});
