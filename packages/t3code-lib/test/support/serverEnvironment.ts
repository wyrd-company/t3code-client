// ---
// relationships:
//   implements: library-testing
// ---

/** An owned test server is not a child of the app's service launcher. */
export function serverEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.keys(source)
      .filter((key) => key !== "T3_SERVICE_LAUNCHER_CONTEXT")
      .map((key) => [key, source[key]]),
  );
}
