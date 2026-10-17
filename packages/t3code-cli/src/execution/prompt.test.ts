// ---
// relationships:
//   verifies: command-contract
// ---
import { expect, it, vi } from "vite-plus/test";
import { T3PreconditionError } from "@wyrd-company/t3code-lib";
import { readPrompt, type PromptInput } from "./prompt.ts";

function input(isTTY = false): PromptInput {
  return {
    isTTY,
    readStdin: vi.fn(async () => "stdin prompt"),
    readFile: vi.fn(async () => "file prompt"),
    question: vi.fn(async () => "interactive prompt"),
  };
}
it.each(["", " ", "positional"])(
  "rejects positional/file conflict by presence: %j",
  async (value) => {
    const source = input();
    await expect(readPrompt(value, "sample.txt", source)).rejects.toBeInstanceOf(
      T3PreconditionError,
    );
    expect(source.readFile).not.toHaveBeenCalled();
    expect(source.readStdin).not.toHaveBeenCalled();
  },
);
it("selects each source without consuming another", async () => {
  const source = input();
  expect(await readPrompt("  positional prompt\n", undefined, source)).toBe(
    "  positional prompt\n",
  );
  expect(source.readStdin).not.toHaveBeenCalled();
  expect(await readPrompt(undefined, "sample.txt", source)).toBe("file prompt");
  expect(source.readFile).toHaveBeenCalledExactlyOnceWith("sample.txt");
  expect(await readPrompt(undefined, "-", source)).toBe("stdin prompt");
  expect(await readPrompt(undefined, undefined, source)).toBe("stdin prompt");
  expect(source.readStdin).toHaveBeenCalledTimes(2);
  expect(source.question).not.toHaveBeenCalled();
});
it("prompts only on a TTY and explicit dash still reads stdin", async () => {
  const source = input(true);
  expect(await readPrompt(undefined, undefined, source)).toBe("interactive prompt");
  expect(source.question).toHaveBeenCalledOnce();
  expect(await readPrompt(undefined, "-", source)).toBe("stdin prompt");
});
it.each(["", " \n\t"])(
  "rejects empty positional, file, stdin and interactive input: %j",
  async (blank) => {
    const source = {
      isTTY: false,
      readStdin: async () => blank,
      readFile: async () => blank,
      question: async () => blank,
    };
    for (const [positional, file, tty] of [
      [blank, undefined, false],
      [undefined, "sample.txt", false],
      [undefined, undefined, false],
      [undefined, undefined, true],
    ] as const)
      await expect(readPrompt(positional, file, { ...source, isTTY: tty })).rejects.toBeInstanceOf(
        T3PreconditionError,
      );
  },
);
it("preserves unreadable-file errors as unexpected local failures", async () => {
  const error = new Error("unreadable");
  await expect(
    readPrompt(undefined, "sample.txt", {
      ...input(),
      readFile: async () => {
        throw error;
      },
    }),
  ).rejects.toBe(error);
});
