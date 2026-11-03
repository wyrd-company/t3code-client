// ---
// relationships:
//   implements: library-testing
// ---

/**
 * What a server or a provider it runs reads to find a real account, session, device or relay
 * of this machine. `HOME` does not hide a value here, since each takes precedence over it.
 */
const MACHINE_ACCESS_PREFIXES = [
  "AGENT_DEVICE_",
  "ANTHROPIC_",
  "CLAUDE_CODE_",
  "EXPO_",
  "OPENCODE_",
  "PI_CODING_AGENT_",
  "T3CODE_BITBUCKET_",
];
const MACHINE_ACCESS_NAMES = new Set([
  "ANDROID_HOME",
  "ANDROID_SDK_ROOT",
  "ANTIGRAVITY_DATA_DIR",
  "CLAUDE_CONFIG_DIR",
  "CURSOR_API_KEY",
  "CURSOR_AUTH_TOKEN",
  "GEMINI_API_KEY",
  "GEMINI_HOME",
  "GH_ENTERPRISE_TOKEN",
  "GH_TOKEN",
  "GITHUB_ENTERPRISE_TOKEN",
  "GITHUB_TOKEN",
  "GITLAB_TOKEN",
  "GLAB_TOKEN",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "T3CODE_RELAY_URL",
  "XAI_API_KEY",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
]);

/**
 * What a scratch server's environment must change, so that it cannot reach this machine's
 * access. `undefined` removes a value that the server inherits.
 */
export function clearedMachineAccess(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.keys(source)
      .filter(
        (key) =>
          MACHINE_ACCESS_NAMES.has(key) ||
          MACHINE_ACCESS_PREFIXES.some((prefix) => key.startsWith(prefix)),
      )
      .map((key) => [key, undefined]),
  );
}

/** An owned test server is not a child of the app's service launcher. */
export function serverEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.keys(source)
      .filter((key) => key !== "T3_SERVICE_LAUNCHER_CONTEXT")
      .map((key) => [key, source[key]]),
  );
}
