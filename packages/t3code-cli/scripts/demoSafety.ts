// ---
// relationships:
//   verifies: profiles
// ---
/** Buffer before forwarding so a credential can never reach frames or retained output. */
export function sanitizeDemoOutput(text: string, secrets: (string | undefined)[]): string {
  for (const secret of secrets) if (secret) text = text.replaceAll(secret, "[redacted]");
  return text
    .replace(/Bearer\s+\S+/giu, "Bearer [redacted]")
    .replace(/([?#&]token=)[^\s&]+/giu, "$1[redacted]");
}
