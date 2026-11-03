// ---
// relationships:
//   verifies: library-testing
// ---
import { expect, it } from "vite-plus/test";
import { clearedMachineAccess, serverEnvironment } from "./serverEnvironment.ts";

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

it("removes each value that reaches this machine's access, and no other", () => {
  expect(
    clearedMachineAccess({
      AGENT_DEVICE_SPEC: "sample",
      ANDROID_HOME: "/sample",
      ANDROID_SDK_ROOT: "/sample",
      EXPO_TOKEN: "sample",
      GH_TOKEN: "sample",
      GITHUB_TOKEN: "sample",
      GITLAB_TOKEN: "sample",
      OPENAI_API_KEY: "sample",
      T3CODE_RELAY_URL: "https://relay.invalid",
      PATH: "/bin",
      SAMPLE_VALUE: "sample",
      GH_TOKEN_NOTE: "sample",
    }),
  ).toEqual({
    AGENT_DEVICE_SPEC: undefined,
    ANDROID_HOME: undefined,
    ANDROID_SDK_ROOT: undefined,
    EXPO_TOKEN: undefined,
    GH_TOKEN: undefined,
    GITHUB_TOKEN: undefined,
    GITLAB_TOKEN: undefined,
    OPENAI_API_KEY: undefined,
    T3CODE_RELAY_URL: undefined,
  });
});
