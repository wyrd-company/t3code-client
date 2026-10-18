// ---
// relationships:
//   verifies: mcp
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import { cleanEnv } from "../../test/support/liveEnvironment.ts";
afterEach(() => vi.unstubAllEnvs());
it("allows only the temporary server environment and excludes parent credentials", () => {
  for (const key of [
    "GITHUB_TOKEN",
    "NPM_TOKEN",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "SAMPLE_OTHER_SECRET",
    "CODEX_HOME",
    "T3CODE_MCP_CONFIG",
  ])
    vi.stubEnv(key, "sample-private-value");
  vi.stubEnv("PATH", "/sample/bin");
  vi.stubEnv("LANG", "C.UTF-8");
  expect(cleanEnv("/tmp/sample-home")).toMatchObject({
    PATH: "/sample/bin",
    HOME: "/tmp/sample-home",
    LANG: "C.UTF-8",
    T3CODE_NO_BROWSER: "1",
  });
  expect(JSON.stringify(cleanEnv("/tmp/sample-home"))).not.toContain("sample-private-value");
  expect(
    Object.keys(cleanEnv("/tmp/sample-home")).every((key) =>
      ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "T3CODE_NO_BROWSER"].includes(key),
    ),
  ).toBe(true);
});
