// ---
// relationships:
//   verifies: proxy
// ---
import "vite-plus/test/config";
import { defineConfig } from "vite-plus";
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/proof/**/*.proof.test.ts"],
    globalSetup: ["test/proof/proofSetup.ts"],
    setupFiles: ["test/proof/exampleNames.ts"],
    testTimeout: 420_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
