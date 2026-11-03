// ---
// relationships:
//   verifies: proxy
// ---
/**
 * What the agent received, from the session record that Codex writes for each turn. A reply does
 * not show this, because the model can answer without using an image that it received.
 */
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

export interface AgentInput {
  readonly text: string;
  readonly images: readonly Buffer[];
}

interface ContentItem {
  readonly type?: string;
  readonly text?: string;
  readonly image_url?: string;
}

const DATA_URL = /^data:[^;,]+;base64,(.*)$/su;
const SAVED_FILE = /\[Attached file "[^"]*" is saved at: (.+?)(?: \(text extracted to: .*\))?\]/u;

function parseInput(line: string): AgentInput | undefined {
  let record: {
    type?: string;
    payload?: { role?: string; content?: readonly ContentItem[] };
  };
  try {
    record = JSON.parse(line) as typeof record;
  } catch {
    // Codex can still be writing the last line. The caller reads again.
    return undefined;
  }
  const payload = record.payload;
  if (record.type !== "response_item" || payload?.role !== "user") {
    return undefined;
  }
  const content = payload.content ?? [];
  return {
    text: content.flatMap((item) => (item.type === "input_text" ? [item.text ?? ""] : [])).join(""),
    images: content.flatMap((item) => {
      if (item.type !== "input_image") return [];
      const encoded = DATA_URL.exec(item.image_url ?? "")?.[1];
      return encoded === undefined ? [] : [Buffer.from(encoded, "base64")];
    }),
  };
}

async function sessionFiles(directory: string): Promise<string[]> {
  if (!NodeFS.existsSync(directory)) return [];
  const entries = await NodeFSP.readdir(directory, { withFileTypes: true });
  const found = await Promise.all(
    entries.map(async (entry) => {
      const path = NodePath.join(directory, entry.name);
      if (entry.isDirectory()) return sessionFiles(path);
      return entry.isFile() && /^rollout-.*\.jsonl$/u.test(entry.name) ? [path] : [];
    }),
  );
  return found.flat();
}

/**
 * Each recorded input of a turn that names `attachmentId`. Reads only the session records under
 * `codexHome/sessions`, and only those written at or after `since`.
 */
export async function agentInputs(
  codexHome: string,
  attachmentId: string,
  since = 0,
): Promise<AgentInput[]> {
  const inputs: AgentInput[] = [];
  for (const file of await sessionFiles(NodePath.join(codexHome, "sessions"))) {
    if ((await NodeFSP.stat(file)).mtimeMs < since) continue;
    const content = await NodeFSP.readFile(file, "utf8");
    if (!content.includes(attachmentId)) continue;
    for (const line of content.split("\n")) {
      if (!line.includes(attachmentId)) continue;
      const input = parseInput(line);
      if (input?.text.includes(attachmentId)) inputs.push(input);
    }
  }
  return inputs;
}

/** Why the agent did not receive exactly this image, or undefined if it did. */
export function imageProblem(inputs: readonly AgentInput[], expected: Buffer): string | undefined {
  if (inputs.length === 0) return "no recorded input names the attachment";
  for (const input of inputs) {
    if (input.images.length !== 1) return `the input holds ${input.images.length} images`;
    if (!input.images[0]?.equals(expected)) return "the image bytes differ";
  }
  return undefined;
}

/** Why the agent did not receive a path to this content in `directory`, or undefined if it did. */
export function fileProblem(
  inputs: readonly AgentInput[],
  directory: string,
  expected: string,
): string | undefined {
  if (inputs.length === 0) return "no recorded input names the attachment";
  for (const input of inputs) {
    const path = SAVED_FILE.exec(input.text)?.[1];
    if (path === undefined) return "the input gives no file path";
    if (NodePath.dirname(path) !== directory) return "the file path is not in the attachments";
    if (!NodeFS.existsSync(path)) return "the file does not exist";
    if (NodeFS.readFileSync(path, "utf8") !== expected) return "the file content differs";
  }
  return undefined;
}
