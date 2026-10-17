// ---
// relationships:
//   verifies: command-line
// ---
import { defineConfig } from "vite-plus";
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/live/**/*.live.test.ts"],
    globalSetup: ["./test/live/globalSetup.ts"],
    testTimeout: 240_000,
    fileParallelism: false,
  },
});
