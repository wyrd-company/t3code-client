// ---
// relationships:
//   verifies: profiles
// ---
import { expect, it } from "vite-plus/test";
import { sanitizeDemoOutput } from "../../packages/t3code-cli/scripts/demoSafety.ts";
it("removes every fresh owned credential before display and evidence", () => {
  const secrets = ["sample-pair-secret", "sample-issued-secret", "sample-profile-secret"];
  const output = sanitizeDemoOutput(secrets.join("\n") + "\nsample-profile-secret", secrets);
  expect(output).toBe("[redacted]\n[redacted]\n[redacted]\n[redacted]");
});
it("contains unexpected bearer and pairing URL values at capture", () => {
  expect(
    sanitizeDemoOutput("Bearer sample-secret https://example.test/pair#token=sample-secret", []),
  ).toBe("Bearer [redacted] https://example.test/pair#token=[redacted]");
});
it("preserves real non-secret command outcomes", () => {
  expect(sanitizeDemoOutput("Paired demo (http://127.0.0.1:3000).\nHELLO\n", [undefined])).toBe(
    "Paired demo (http://127.0.0.1:3000).\nHELLO\n",
  );
});
