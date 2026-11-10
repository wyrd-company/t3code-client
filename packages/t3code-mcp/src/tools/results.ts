// ---
// relationships:
//   implements: mcp
// ---

/** The longest untrusted text, such as a command line or a cause, that a tool result keeps. */
export const maxTextChars = 500;

/** At most `maxTextChars` characters; a longer text keeps its start and ends with an ellipsis. */
export function clip(text: string): string {
  return text.length > maxTextChars ? `${text.slice(0, maxTextChars - 1)}…` : text;
}

/** An Effect `Option` as the server encodes it. */
export type OptionRecord<T> =
  | { readonly _tag: "None" }
  | { readonly _tag: "Some"; readonly value: T };

/** An Effect `Option` record as its value, or null for `None`. */
export function optional<T>(option: OptionRecord<T>): T | null {
  return option._tag === "Some" ? option.value : null;
}
