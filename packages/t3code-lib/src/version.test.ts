// ---
// relationships:
//   verifies: library
// ---
import { expect, it } from "vite-plus/test";
import { TARGET_T3_CODE_VERSION } from "./index.ts";

it("exports the server target independently of the library release version", () => {
  expect(TARGET_T3_CODE_VERSION).toBe("0.1.2");
});
