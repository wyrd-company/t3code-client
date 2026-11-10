// ---
// relationships:
//   verifies: library
// ---
import * as NodeFSP from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { TARGET_T3_CODE_VERSION } from "./index.ts";

it("exports the pinned `t3` server version, independent of the library version", async () => {
  const manifest = JSON.parse(
    await NodeFSP.readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { devDependencies: Record<string, string> };
  expect(manifest.devDependencies["t3"]).toBe(TARGET_T3_CODE_VERSION);
});
