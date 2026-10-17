// ---
// relationships:
//   verifies: output-contract
// ---
import { expect, it, vi } from "vite-plus/test";
import { followSignals } from "./signals.ts";
import { Output } from "../output.ts";

it("exits on a second signal even when the final error line cannot be written", () => {
  const output = new Output({
    stdout: () => {},
    stderr: () => {
      throw new Error("closed sink");
    },
  });
  const exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("immediate exit");
  });
  const signals = followSignals(output);
  try {
    process.emit("SIGINT");
    expect(() => process.emit("SIGTERM")).toThrow("immediate exit");
    expect(exit).toHaveBeenCalledWith(4);
  } finally {
    signals.close();
    exit.mockRestore();
  }
});
