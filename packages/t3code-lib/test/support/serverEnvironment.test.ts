// ---
// relationships:
//   verifies: library-testing
// ---
import { expect, it } from "vite-plus/test";
import { clearedMachineAccess, serverEnvironment } from "./serverEnvironment.ts";

it("omits launcher context without reading it and preserves the caller environment", () => {
  const source: NodeJS.ProcessEnv = { PATH: "/bin", T3_LIVE_MODEL: "example-model" };
  Object.defineProperty(source, "T3_SERVICE_LAUNCHER_CONTEXT", {
    enumerable: true,
    get() {
      throw new Error("Launcher context must not be read");
    },
  });
  const result = serverEnvironment(source);
  expect(result).toEqual({ PATH: "/bin", T3_LIVE_MODEL: "example-model" });
  expect(Object.hasOwn(result, "T3_SERVICE_LAUNCHER_CONTEXT")).toBe(false);
  expect(Object.hasOwn(source, "T3_SERVICE_LAUNCHER_CONTEXT")).toBe(true);
  result["PATH"] = "/other";
  expect(source["PATH"]).toBe("/bin");
});

it("preserves standalone environments", () => {
  expect(serverEnvironment({ PATH: "/bin" })).toEqual({ PATH: "/bin" });
});

it("removes each value that reaches this machine's access, and no other", () => {
  const access = [
    "AGENT_DEVICE_SPEC",
    "ANDROID_HOME",
    "ANDROID_SDK_ROOT",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "ANTIGRAVITY_DATA_DIR",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CONFIG_DIR",
    "CURSOR_API_KEY",
    "EXPO_TOKEN",
    "GEMINI_HOME",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "GITLAB_TOKEN",
    "GROK_AUTH",
    "GROK_LOCAL_AUTH",
    "OPENAI_API_KEY",
    "OPENCODE_DATA_DIR",
    "PI_CODING_AGENT_DIR",
    "PI_CODING_AGENT_SESSION_DIR",
    "T3CODE_BITBUCKET_API_TOKEN",
    "T3CODE_CLOUDFLARED_PATH",
    "T3CODE_DEV_AUTH_TOKEN",
    "T3CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN",
    "T3CODE_RELAY_URL",
    "XAI_API_KEY",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_STATE_HOME",
  ];
  expect(
    clearedMachineAccess({
      ...Object.fromEntries(access.map((name) => [name, "sample"])),
      PATH: "/bin",
      SAMPLE_VALUE: "sample",
      GH_TOKEN_NOTE: "sample",
      XDG_RUNTIME_DIR: "/sample",
    }),
  ).toEqual(Object.fromEntries(access.map((name) => [name, undefined])));
});
