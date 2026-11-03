// ---
// relationships:
//   verifies: proxy
// ---
import { describe, expect, it } from "vite-plus/test";
import { ATTACHMENT_ONLY_PLACEHOLDER as PLACEHOLDER, withByline, withoutByline } from "./byline.ts";

const names = ["Sam", "Samira", "Alice"];

describe("withByline", () => {
  it.each([
    "/compact",
    "/logout",
    "/goal finish",
    "  /compact",
    "\n/compact",
    "/tmp/a.txt is gone",
  ])("keeps %j unchanged", (text) => expect(withByline(text, "Sam")).toBe(text));
  it("adds the byline after a slash inside the text", () => {
    expect(withByline("see /tmp", "Sam")).toBe("see /tmp\n\n— Sent by Sam");
  });
  it("makes empty text the byline alone", () => {
    expect(withByline("", "Sam")).toBe("— Sent by Sam");
  });
  it("keeps a byline that the sender quotes", () => {
    const text = "Quote:\n\n— Sent by Alice";
    expect(withByline(text, "Sam")).toBe(`${text}\n\n— Sent by Sam`);
  });
  it("makes the exact placeholder the byline alone", () => {
    expect(withByline(PLACEHOLDER, "Sam")).toBe("— Sent by Sam");
  });
  it.each(["Ultrathink:\n", "ultrathink: ", "Ultrathink:"])(
    "keeps the %j prefix and replaces only the placeholder",
    (prefix) => {
      expect(withByline(`${prefix}${PLACEHOLDER}`, "Sam")).toBe(`${prefix}— Sent by Sam`);
    },
  );
  it.each([`a ${PLACEHOLDER}`, `${PLACEHOLDER} `, `Ultrathink: a ${PLACEHOLDER}`])(
    "treats %j as normal text",
    (text) => expect(withByline(text, "Sam")).toBe(`${text}\n\n— Sent by Sam`),
  );
  it("treats file references as normal text", () => {
    const text = "@report.txt";
    expect(withByline(text, "Sam")).toBe("@report.txt\n\n— Sent by Sam");
  });
});

describe("withoutByline", () => {
  it.each([
    ["hi\n\n— Sent by Sam", "hi"],
    ["hi\n\n— Sent by Sam EDITED", "hi EDITED"],
    ["hi\n\n— Sent by SamEDITED", "hiEDITED"],
    ["hi\n\n— Sent by Sam\nmore", "hi\nmore"],
    ["hi\n\n— Sent by Sam\n\nmore", "hi\n\nmore"],
    ["hi\n— Sent by Sam", "hi"],
    ["hi\n\n\n— Sent by Sam", "hi"],
    ["hi\r\n\r\n— Sent by Sam", "hi"],
    ["— Sent by Sam", ""],
    ["— Sent by Sam more", "more"],
    ["— Sent by Sam\n    code()", "    code()"],
    ["— Sent by Sam\r\n\r\n\tcode()\n", "\tcode()"],
    ["— Sent by Sam  \n  code()", "  code()"],
  ])("makes %j into %j", (text, expected) => {
    expect(withoutByline(text, names)).toBe(expected);
  });
  it("matches the longest configured name", () => {
    expect(withoutByline("hi\n\n— Sent by Samira", names)).toBe("hi");
  });
  it("keeps the longest match when the names are in any order", () => {
    expect(withoutByline("hi\n\n— Sent by Samira", ["Samira", "Sam"])).toBe("hi");
    expect(withoutByline("hi\n\n— Sent by Samira", ["Sam", "Samira"])).toBe("hi");
  });
  it("removes only the last byline", () => {
    expect(withoutByline("Quote:\n\n— Sent by Alice\n\n— Sent by Sam", names)).toBe(
      "Quote:\n\n— Sent by Alice",
    );
  });
  it("keeps a byline that is not at the start of a line", () => {
    const text = "they wrote — Sent by Sam";
    expect(withoutByline(text, names)).toBe(text);
  });
  it("finds an earlier byline behind one that is not at the start of a line", () => {
    expect(withoutByline("— Sent by Sam\nthey wrote — Sent by Sam", names)).toBe(
      "they wrote — Sent by Sam",
    );
  });
  it("keeps a line with a name that is not configured", () => {
    const text = "hi\n\n— Sent by Someone";
    expect(withoutByline(text, names)).toBe(text);
  });
  it("finds an earlier configured byline behind one with an unknown name", () => {
    expect(withoutByline("hi\n\n— Sent by Sam\n— Sent by Someone", names)).toBe(
      "hi\n— Sent by Someone",
    );
  });
  it("keeps the remainder of a name that starts with a configured name", () => {
    expect(withoutByline("hi\n\n— Sent by Alicia", ["Ali"])).toBe("hicia");
  });
  it("handles many line breaks with no byline in linear time", () => {
    const text = "\n".repeat(2_000_000);
    expect(withoutByline(text, names)).toBe(text);
  });
});
