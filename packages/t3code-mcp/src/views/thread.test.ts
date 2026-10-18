// ---
// relationships:
//   verifies: mcp
// ---
import { expect, it } from "vite-plus/test";
import { projection, shell } from "../../test/support/fakes.ts";
import { projectionView, threadView, trimItem } from "./thread.ts";
it("separates run terminal state from the user settled marker", () => {
  expect(projectionView("alpha", projection()).settled).toBe(true);
  expect(projectionView("alpha", projection("running")).settled).toBe(false);
  expect(projectionView("alpha", projection("idle")).settled).toBe(false);
  expect(
    threadView("alpha", shell({ settledAt: "2020-01-01T00:00:00.000Z", settledOverride: "active" }))
      .settled,
  ).toBe(false);
});
it("bounds nested strings without losing structure", () => {
  expect(trimItem({ text: "abcdef", result: ["sample", 4] }, 3)).toEqual({
    value: { text: "abc", result: ["sam", 4] },
    truncated: true,
  });
});
it("preserves item identity and type while cutting text", () => {
  expect(
    trimItem({ id: "item-with-long-id", type: "assistant_message", text: "sample" }, 2),
  ).toEqual({
    value: { id: "item-with-long-id", type: "assistant_message", text: "sa" },
    truncated: true,
  });
});
