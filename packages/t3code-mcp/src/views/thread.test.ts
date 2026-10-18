// ---
// relationships:
//   verifies: mcp
// ---
import { expect, it } from "vite-plus/test";
import { projection, shell } from "../../test/support/fakes.ts";
import { projectionView, threadView, trimItem } from "./thread.ts";
it("separates run terminal state from the user settled marker", () => {
  expect(projectionView("alpha", projection()).done).toBe(true);
  expect(projectionView("alpha", projection("running")).done).toBe(false);
  expect(projectionView("alpha", projection("idle")).done).toBe(false);
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

it("keeps settled as the same user marker in shell and projection views", () => {
  for (const settledOverride of [null, "active", "settled"] as const) {
    const thread = shell({ settledOverride, settledAt: "2020-01-01T00:00:00.000Z" });
    for (const status of ["running", "completed", "idle"]) {
      expect(projectionView("alpha", projection(status, { thread })).settled).toBe(
        threadView("alpha", thread).settled,
      );
    }
  }
});
it.each([
  {
    type: "dynamic_tool",
    output: { body: "long payload", nested: { arbitrary: ["long payload"] } },
  },
  { type: "file_search", results: [{ preview: "long payload" }] },
  { type: "subagent", progress: "long payload" },
])("bounds every payload string in $type", (item) => {
  const cut = trimItem(
    {
      id: "item-with-long-id",
      status: "completed",
      updatedAt: "2020-01-01T00:00:00.000Z",
      ...item,
    },
    4,
  );
  expect(cut.truncated).toBe(true);
  expect(JSON.stringify(cut.value)).not.toContain("long payload");
  expect(cut.value).toMatchObject({
    id: "item-with-long-id",
    type: item.type,
    status: "completed",
    updatedAt: "2020-01-01T00:00:00.000Z",
  });
});
