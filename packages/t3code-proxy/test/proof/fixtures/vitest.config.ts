// ---
// relationships:
//   verifies: proxy
// ---
import "vite-plus/test/config";
import { defineConfig } from "vite-plus";
/** One run of the proof's real setup, for `lifetime.proof.test.ts`. It starts no provider turn. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/proof/fixtures/openBrowser.fixture.ts"],
    globalSetup: ["test/proof/proofSetup.ts"],
    setupFiles: ["test/proof/exitWithVitest.ts"],
    testTimeout: 300_000,
    hookTimeout: 120_000,
  },
});
