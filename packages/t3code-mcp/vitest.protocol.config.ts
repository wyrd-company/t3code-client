// ---
// relationships:
//   verifies: mcp
// ---
import "vite-plus/test/config";
import { defineConfig } from "vite-plus";
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/protocol/**/*.test.ts", "test/vendor/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
