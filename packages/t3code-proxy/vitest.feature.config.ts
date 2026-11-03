// ---
// relationships:
//   verifies: proxy
// ---
import "vite-plus/test/config";
import { defineConfig } from "vite-plus";
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/feature/**/*.feature.test.ts"],
    setupFiles: ["test/feature/featureNames.ts"],
    testTimeout: 180_000,
  },
});
