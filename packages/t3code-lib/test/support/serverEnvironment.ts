// ---
// relationships:
//   implements: library-testing
// ---

/** What a method of a server can use to reach a real account, device or relay of this machine. */
const MACHINE_ACCESS =
  /^(?:AGENT_DEVICE_|EXPO_|(?:ANDROID_HOME|ANDROID_SDK_ROOT|GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GITLAB_TOKEN|GLAB_TOKEN|OPENAI_API_KEY|OPENAI_BASE_URL|ANTHROPIC_API_KEY|T3CODE_RELAY_URL)$)/u;

/**
 * What a scratch server's environment must change, so that it cannot reach this machine's
 * access. `undefined` removes a value that the server inherits.
 */
export function clearedMachineAccess(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.keys(source)
      .filter((key) => MACHINE_ACCESS.test(key))
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
