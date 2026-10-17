// ---
// relationships:
//   implements: profiles
// ---
/** Blank environment inputs are absent; nonblank values retain their exact contents. */
export function environmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value.trim().length === 0 ? undefined : value;
}
