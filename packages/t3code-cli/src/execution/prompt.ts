// ---
// relationships:
//   implements: command-contract
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeReadline from "node:readline/promises";
import { T3PreconditionError } from "@wyrd-company/t3code-lib";

export interface PromptInput {
  readonly isTTY: boolean;
  readStdin(signal?: AbortSignal): Promise<string>;
  readFile(path: string, signal?: AbortSignal): Promise<string>;
  question(signal?: AbortSignal): Promise<string>;
}

const processInput: PromptInput = {
  isTTY: process.stdin.isTTY === true,
  async readStdin(signal) {
    const cancel = () => process.stdin.destroy();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      if (signal?.aborted) signal.throwIfAborted();
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString("utf8");
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  },
  readFile: (path, signal) =>
    NodeFSP.readFile(path, { encoding: "utf8", ...(signal ? { signal } : {}) }),
  async question(signal) {
    const readline = NodeReadline.createInterface({ input: process.stdin, output: process.stderr });
    try {
      return await readline.question("Prompt: ", signal ? { signal } : {});
    } finally {
      readline.close();
    }
  },
};

/** Presence, rather than truthiness, selects the single prompt source. */
export async function readPrompt(
  positional: string | undefined,
  promptFile: string | undefined,
  input: PromptInput = processInput,
  signal?: AbortSignal,
): Promise<string> {
  if (positional !== undefined && promptFile !== undefined)
    throw new T3PreconditionError("Choose one prompt source.");
  const prompt =
    positional !== undefined
      ? positional
      : promptFile !== undefined && promptFile !== "-"
        ? await input.readFile(promptFile, signal)
        : promptFile === "-" || !input.isTTY
          ? await input.readStdin(signal)
          : await input.question(signal);
  if (!prompt.trim()) throw new T3PreconditionError("A prompt is required.");
  return prompt;
}
