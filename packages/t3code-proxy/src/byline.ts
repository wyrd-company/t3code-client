// ---
// relationships:
//   implements: proxy
// ---

const BYLINE_START = "— Sent by ";

/** Upstream `ATTACHMENT_ONLY_BOOTSTRAP_PROMPT`. Clients hide it only on an exact match. */
export const ATTACHMENT_ONLY_PLACEHOLDER =
  "[User attached one or more files without additional text. Respond using the conversation context and the attached files.]";

const ULTRATHINK_PREFIX = /^Ultrathink:\s*$/iu;

/** Applies the byline rules to one message. */
export function withByline(text: string, name: string): string {
  if (text.trimStart().startsWith("/")) return text;
  const byline = `${BYLINE_START}${name}`;
  if (text === "" || text === ATTACHMENT_ONLY_PLACEHOLDER) return byline;
  if (text.endsWith(ATTACHMENT_ONLY_PLACEHOLDER)) {
    const prefix = text.slice(0, -ATTACHMENT_ONLY_PLACEHOLDER.length);
    if (ULTRATHINK_PREFIX.test(prefix)) return `${prefix}${byline}`;
  }
  return `${text}\n\n${byline}`;
}

function isLineBreak(character: string | undefined): boolean {
  return character === "\n" || character === "\r";
}

/**
 * Removes the last byline with a configured name and keeps all other text. A queue edit starts from
 * the stored text with the cursor after the byline, so typed text can follow it on the same line.
 */
export function withoutByline(text: string, names: readonly string[]): string {
  const longestFirst = [...names].sort((a, b) => b.length - a.length);
  for (let at = text.lastIndexOf(BYLINE_START); at !== -1;) {
    const name =
      at === 0 || text[at - 1] === "\n"
        ? longestFirst.find((known) => text.startsWith(known, at + BYLINE_START.length))
        : undefined;
    if (name !== undefined) {
      let start = at;
      while (start > 0 && isLineBreak(text[start - 1])) start -= 1;
      const before = text.slice(0, start);
      const after = text.slice(at + BYLINE_START.length + name.length);
      return before === "" ? after.trim() : `${before}${after}`.trimEnd();
    }
    at = at === 0 ? -1 : text.lastIndexOf(BYLINE_START, at - 1);
  }
  return text;
}
