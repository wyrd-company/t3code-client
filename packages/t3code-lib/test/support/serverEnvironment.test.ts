// ---
// relationships:
//   verifies: library-testing
// ---
import { expect, it } from "vite-plus/test";
import { serverEnvironment } from "./serverEnvironment.ts";

it("omits launcher context without reading it and preserves the caller environment", () => {
  const source: NodeJS.ProcessEnv = { PATH: "/bin", T3_LIVE_MODEL: "example-model" };
  Object.defineProperty(source, "T3_SERVICE_LAUNCHER_CONTEXT", {
    enumerable: true,
    get() {
      throw new Error("Launcher context must not be read");
    },
  });
  const result = serverEnvironment(source);
  expect(result).toEqual({ PATH: "/bin", T3_LIVE_MODEL: "example-model" });
  expect(Object.hasOwn(result, "T3_SERVICE_LAUNCHER_CONTEXT")).toBe(false);
  expect(Object.hasOwn(source, "T3_SERVICE_LAUNCHER_CONTEXT")).toBe(true);
  result["PATH"] = "/other";
  expect(source["PATH"]).toBe("/bin");
});

it("preserves standalone environments", () => {
  expect(serverEnvironment({ PATH: "/bin" })).toEqual({ PATH: "/bin" });
});
