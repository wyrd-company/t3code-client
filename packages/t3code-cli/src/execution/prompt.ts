// ---
// relationships:
//   implements: command-contract
// ---
import * as NodeFSP from "node:fs/promises";
import * as NodeReadline from "node:readline/promises";
import { T3PreconditionError } from "@wyrd-company/t3code-lib";

export interface PromptInput {
  readonly isTTY: boolean;
  readStdin(): Promise<string>;
  readFile(path: string): Promise<string>;
  question(): Promise<string>;
}

const processInput: PromptInput = {
  isTTY: process.stdin.isTTY === true,
  async readStdin() {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf8");
  },
  readFile: (path) => NodeFSP.readFile(path, "utf8"),
  async question() {
    const readline = NodeReadline.createInterface({ input: process.stdin, output: process.stderr });
    try {
      return await readline.question("Prompt: ");
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
): Promise<string> {
  if (positional !== undefined && promptFile !== undefined)
    throw new T3PreconditionError("Choose one prompt source.");
  const prompt =
    positional !== undefined
      ? positional
      : promptFile !== undefined && promptFile !== "-"
        ? await input.readFile(promptFile)
        : promptFile === "-" || !input.isTTY
          ? await input.readStdin()
          : await input.question();
  if (!prompt.trim()) throw new T3PreconditionError("A prompt is required.");
  return prompt;
}
