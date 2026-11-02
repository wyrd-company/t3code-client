// ---
// relationships:
//   implements: library
// ---
/** Mirrors `packages/contracts/src/editor.ts`. */
import { z } from "zod";
import { TrimmedNonEmptyString, forwardCompatibleLiteral } from "./common.ts";

export const EDITOR_IDS = [
  "cursor",
  "trae",
  "kiro",
  "vscode",
  "vscode-insiders",
  "vscodium",
  "zed",
  "antigravity",
  "idea",
  "aqua",
  "clion",
  "datagrip",
  "dataspell",
  "goland",
  "phpstorm",
  "pycharm",
  "rider",
  "rubymine",
  "rustrover",
  "webstorm",
  "file-manager",
] as const;

/** An editor a server reports; a newer server can report one this list does not name. */
export const EditorId = forwardCompatibleLiteral(EDITOR_IDS);
export type EditorId = z.infer<typeof EditorId>;

export const LaunchEditorInput = z.looseObject({
  cwd: TrimmedNonEmptyString,
  editor: z.enum(EDITOR_IDS),
  /** Only for `file-manager`; requires the server's `shellRevealInFileManager` capability. */
  reveal: z.boolean().optional(),
});
export type LaunchEditorInput = z.infer<typeof LaunchEditorInput>;
