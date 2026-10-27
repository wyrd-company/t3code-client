// ---
// relationships:
//   verifies: command-line
//   references: cli-surface
// ---
import * as NodeFSP from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { main } from "../main.ts";
import type { CommandSurface } from "../registration.ts";

const surface = JSON.parse(
  await NodeFSP.readFile(
    new URL("../../../../docs/specifications/cli-surface.json", import.meta.url),
    "utf8",
  ),
) as CommandSurface;
const sink = { stdout() {}, stderr() {} };

/** Parse through the canonical surface and return the handler's options. */
async function parse(argv: string[]) {
  let seen: Record<string, unknown> | undefined;
  const capture = async (
    _args: readonly string[],
    command: { optsWithGlobals(): Record<string, unknown> },
  ) => {
    seen = command.optsWithGlobals();
  };
  const exit = await main(argv, surface, sink, {
    run: capture,
    "thread start": capture,
    "thread send": capture,
  });
  return { exit, options: seen };
}

it.each([["run"], ["thread", "start"]])(
  "%s keeps an omitted start-from-origin omitted and passes explicit true/false",
  async (...command) => {
    const omitted = await parse([...command, "prompt", "--worktree"]);
    expect(omitted.exit).toBe(0);
    expect(omitted.options).not.toHaveProperty("startFromOrigin");
    for (const [flag, value] of [
      ["--start-from-origin", true],
      ["--no-start-from-origin", false],
    ] as const) {
      const parsed = await parse([...command, "prompt", "--worktree", flag]);
      expect(parsed.options?.["startFromOrigin"]).toBe(value);
    }
  },
);
it.each([["run"], ["thread", "start"]])(
  "%s collects repeated model options and launch selections",
  async (...command) => {
    const parsed = await parse([
      ...command,
      "prompt",
      "--model-option",
      "first=one",
      "--model-option",
      "second=two",
      "--clear-model-options",
      "--existing-worktree",
      "/sample-worktree",
    ]);
    expect(parsed.options).toMatchObject({
      modelOption: ["first=one", "second=two"],
      clearModelOptions: true,
      existingWorktree: "/sample-worktree",
    });
    const plain = await parse([...command, "prompt"]);
    expect(plain.options).not.toHaveProperty("modelOption");
    expect(plain.options).not.toHaveProperty("clearModelOptions");
  },
);
it("thread send accepts model option controls only", async () => {
  const parsed = await parse([
    "thread",
    "send",
    "sample-thread",
    "prompt",
    "--model-option",
    "first=one",
    "--clear-model-options",
  ]);
  expect(parsed.options).toMatchObject({ modelOption: ["first=one"], clearModelOptions: true });
  for (const flag of [
    "--worktree",
    "--existing-worktree=/x",
    "--branch=b",
    "--no-start-from-origin",
  ])
    expect((await parse(["thread", "send", "sample-thread", "prompt", flag])).exit).toBe(2);
});
it.each([
  ["--existing-worktree", "/x", "--worktree"],
  ["--existing-worktree", "/x", "--no-start-from-origin"],
  ["--existing-worktree", "/x", "--branch", "b"],
  ["--thread", "t", "--existing-worktree", "/x"],
  ["--thread", "t", "--no-start-from-origin"],
  ["--thread", "t", "--branch", "b"],
])("rejects conflicting launch selection %j as a usage error", async (...flags) => {
  const parsed = await parse(["run", "prompt", ...flags]);
  expect(parsed.exit).toBe(2);
  expect(parsed.options).toBeUndefined();
});
