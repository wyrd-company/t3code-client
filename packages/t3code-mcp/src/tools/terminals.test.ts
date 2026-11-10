// ---
// relationships:
//   verifies: mcp
// ---
import { expect, it } from "vite-plus/test";
import { plainText } from "./terminals.ts";

it.each([
  ["CSI colour and cursor", "\u001b[1;31mFAIL\u001b[0m\u001b[2K\u001b[?25h", "FAIL"],
  ["OSC title ended by BEL", "\u001b]0;sample title\u0007text", "text"],
  [
    "OSC hyperlink ended by ST",
    "\u001b]8;;https://example.com\u001b\\link\u001b]8;;\u001b\\",
    "link",
  ],
  ["character set designators", "\u001b(Bone\u001b)0two\u001b%Gthree", "onetwothree"],
  ["DCS payload", "a\u001bP1$r0m\u001b\\b", "ab"],
  [
    "APC, PM and SOS payloads",
    "a\u001b_payload\u001b\\b\u001b^note\u001b\\c\u001bXsos\u001b\\d",
    "abcd",
  ],
  ["keypad and save modes", "a\u001b=b\u001b>c\u001b7d\u001b8e", "abcde"],
  ["an unterminated string sequence", "a\u001bPunfinished", "a"],
  ["a lone trailing ESC", "a\u001b", "a"],
  ["C0 and C1 controls", "a\u0008b\rc\u0085d\u009b\u007fe", "abcde"],
  ["CRLF, tab and newline", "a\tb\r\nc\n", "a\tb\nc\n"],
  ["Unicode text", "é ✓ 日本\n", "é ✓ 日本\n"],
])("removes %s", (_name, input, expected) => {
  expect(plainText(input)).toBe(expected);
});
