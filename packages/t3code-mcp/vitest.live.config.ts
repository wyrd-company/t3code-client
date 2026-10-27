// ---
// relationships:
//   verifies: mcp
// ---
import "vite-plus/test/config";
import { defineConfig } from "vite-plus";
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/live/**/*.live.test.ts"],
    globalSetup: ["../t3code-cli/test/live/globalSetup.ts"],
    testTimeout: 240_000,
    fileParallelism: false,
  },
});
