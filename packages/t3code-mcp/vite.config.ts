// ---
// relationships:
//   implements: mcp
// ---
import "vite-plus/test/config";
import { defineConfig } from "vite-plus";
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts", "test/protocol/**/*.test.ts"] },
});
