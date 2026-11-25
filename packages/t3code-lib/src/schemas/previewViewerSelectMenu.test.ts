// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, it } from "vite-plus/test";
import { PreviewViewerInput, PreviewViewerMessage } from "./previewViewer.ts";

describe("the viewer's select menu (0.1.12)", () => {
  it("reads an open select menu and its withdrawal", () => {
    const menu = {
      type: "selectMenu",
      id: "menu-1",
      options: [
        { label: "Sample one", disabled: false },
        { label: "Sample two", disabled: true },
      ],
      selectedIndex: 0,
      x: 10,
      y: 20,
      width: 120,
      height: 24,
    };
    const parsed = PreviewViewerMessage.parse(menu);
    expect(parsed).toEqual(menu);
    expect(parsed).not.toHaveProperty("unknown");
    expect(PreviewViewerMessage.parse({ type: "selectMenuClosed", id: "menu-1" })).toEqual({
      type: "selectMenuClosed",
      id: "menu-1",
    });
    expect(PreviewViewerMessage.safeParse({ ...menu, options: [{ label: "x" }] }).success).toBe(
      false,
    );
  });

  it("sends the chosen option by index", () => {
    expect(PreviewViewerInput.parse({ type: "selectMenu", id: "menu-1", index: 1 })).toEqual({
      type: "selectMenu",
      id: "menu-1",
      index: 1,
    });
    expect(PreviewViewerInput.safeParse({ type: "selectMenu", id: "menu-1" }).success).toBe(false);
    expect(
      PreviewViewerInput.safeParse({ type: "selectMenu", id: "menu-1", index: 0.5 }).success,
    ).toBe(false);
  });
});
