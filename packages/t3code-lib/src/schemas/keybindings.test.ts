// ---
// relationships:
//   verifies: library
// ---
import * as NodeFS from "node:fs";
import { expect, expectTypeOf, it } from "vite-plus/test";
import type { KnownOr, UnknownVariant } from "./common.ts";
import {
  KeybindingCommand,
  KeybindingShortcut,
  KeybindingWhenNode,
  ResolvedKeybindingRule,
  ResolvedKeybindingsConfig,
  STATIC_KEYBINDING_COMMANDS,
  type StaticKeybindingCommand,
} from "./keybindings.ts";

type Node =
  | { type: "identifier"; name: string; [key: string]: unknown }
  | { type: "not"; node: Node; [key: string]: unknown }
  | { type: "and"; left: Node; right: Node; [key: string]: unknown }
  | { type: "or"; left: Node; right: Node; [key: string]: unknown }
  | UnknownVariant<"type">;

const config: { keybindings: unknown[] } = JSON.parse(
  NodeFS.readFileSync(new URL("../../test/fixtures/server-config.json", import.meta.url), "utf8"),
);
const shortcut = {
  key: "k",
  metaKey: false,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  modKey: true,
};
const rule = { command: "sidebar.toggle", shortcut };
const id = (name: string) => ({ type: "identifier", name });
const futureNode = { type: "future.node", detail: { retained: true } };
const marks = [{ unknown: true }, { unknown: true, raw: { type: "identifier" } }];
const flags = ["metaKey", "ctrlKey", "shiftKey", "altKey", "modKey"] as const;
const without = (record: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
const withField = (record: Record<string, unknown>, key: string, value: unknown) =>
  value === undefined ? without(record, key) : { ...record, [key]: value };
const ok = (value: unknown) => ResolvedKeybindingRule.safeParse(value).success;

it("types commands, shortcuts and recursive when nodes", () => {
  expectTypeOf<KeybindingCommand>().toEqualTypeOf<KnownOr<StaticKeybindingCommand>>();
  expectTypeOf<KeybindingWhenNode>().toEqualTypeOf<Node>();
  expectTypeOf<KeybindingShortcut>().toEqualTypeOf<{
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    modKey: boolean;
    [key: string]: unknown;
  }>();
  expectTypeOf<ResolvedKeybindingRule>().toEqualTypeOf<{
    command: KnownOr<StaticKeybindingCommand>;
    shortcut: KeybindingShortcut;
    whenAst?: Node | undefined;
    [key: string]: unknown;
  }>();
  expectTypeOf<ResolvedKeybindingsConfig>().toEqualTypeOf<ResolvedKeybindingRule[]>();
});

it("lists the static commands of the pinned server, effort commands included", () => {
  expect(STATIC_KEYBINDING_COMMANDS).toHaveLength(84);
  expect(new Set(STATIC_KEYBINDING_COMMANDS).size).toBe(84);
  expect(STATIC_KEYBINDING_COMMANDS).toEqual(
    expect.arrayContaining(["composer.increaseEffort", "composer.decreaseEffort"]),
  );
});

it("decodes the fixture rules unchanged", () => {
  expect(config.keybindings).toHaveLength(82);
  expect(ResolvedKeybindingsConfig.parse(config.keybindings)).toEqual(config.keybindings);
});

it("keeps every command string and rejects non-string commands", () => {
  const commands = [
    "composer.increaseEffort",
    "composer.decreaseEffort",
    "script.sample-task.run",
    "script..run",
    "script.Not Valid.run",
    "future.command",
    " padded ",
    "",
  ];
  for (const command of commands)
    expect(ResolvedKeybindingRule.parse({ ...rule, command }).command).toBe(command);
  for (const command of [undefined, null, 7, true, {}, ["chat.new"]])
    expect(ok(withField(rule, "command", command))).toBe(false);
});

it("trims shortcut keys to between 1 and 64 characters", () => {
  const key64 = "k".repeat(64);
  for (const [key, decoded] of [
    ["k", "k"],
    ["  k  ", "k"],
    [key64, key64],
    [`  ${key64}  `, key64],
  ])
    expect(ResolvedKeybindingRule.parse({ ...rule, shortcut: { ...shortcut, key } })).toEqual({
      ...rule,
      shortcut: { ...shortcut, key: decoded },
    });
  for (const key of [undefined, null, "", " \t\n", "k".repeat(65), 7])
    expect(ok({ ...rule, shortcut: withField(shortcut, "key", key) })).toBe(false);
});

it("requires each of the five modifier flags as a Boolean", () => {
  for (const flag of flags) {
    for (const value of [true, false])
      expect(ok({ ...rule, shortcut: { ...shortcut, [flag]: value } })).toBe(true);
    for (const value of [undefined, null, "true", 0, 1])
      expect(ok({ ...rule, shortcut: withField(shortcut, flag, value) }), flag).toBe(false);
  }
  for (const value of [undefined, null, "k", [], 7])
    expect(ok(withField(rule, "shortcut", value))).toBe(false);
});

it("decodes nested when nodes without a depth bound and keeps untrimmed names", () => {
  const nested = {
    type: "or",
    left: { type: "and", left: id(" padded "), right: { type: "not", node: id(" ") } },
    right: id("sampleFocus"),
  };
  expect(KeybindingWhenNode.parse(nested)).toEqual(nested);
  let deep: Record<string, unknown> = id("sampleFocus");
  for (let depth = 0; depth < 200; depth++) deep = { type: "not", node: deep };
  expect(KeybindingWhenNode.parse(deep)).toEqual(deep);
  expect(ResolvedKeybindingRule.parse({ ...rule, whenAst: nested })).toEqual({
    ...rule,
    whenAst: nested,
  });
});

it("keeps unknown node types at any depth as unknown variants", () => {
  const unknown = { unknown: true, raw: futureNode };
  expect(KeybindingWhenNode.parse(futureNode)).toEqual(unknown);
  expect(KeybindingWhenNode.parse({ type: "not", node: futureNode })).toEqual({
    type: "not",
    node: unknown,
  });
  expect(
    KeybindingWhenNode.parse({
      type: "or",
      left: id("sampleFocus"),
      right: { type: "and", left: futureNode, right: id("sampleFocus") },
    }),
  ).toEqual({
    type: "or",
    left: id("sampleFocus"),
    right: { type: "and", left: unknown, right: id("sampleFocus") },
  });
});

it("rejects rules whose known when nodes are malformed at any depth", () => {
  const leaf = id("sampleFocus");
  const malformed: unknown[] = [
    null,
    "sampleFocus",
    7,
    [],
    {},
    { type: 3, name: "sampleFocus" },
    { type: "identifier" },
    id(""),
    { type: "identifier", name: 7 },
    { type: "not" },
    { type: "not", node: null },
    { type: "and", right: leaf },
    { type: "and", left: leaf },
    { type: "and", left: null, right: leaf },
    { type: "and", left: leaf, right: "sampleFocus" },
    { type: "or", right: leaf },
    { type: "or", left: leaf },
    { type: "or", left: 7, right: leaf },
    { type: "or", left: leaf, right: [] },
    { type: "or", left: leaf, right: { type: "not", node: { type: "and", left: leaf } } },
  ];
  for (const whenAst of malformed) {
    expect(ok({ ...rule, whenAst }), JSON.stringify(whenAst)).toBe(false);
    expect(ok({ ...rule, whenAst: { type: "not", node: whenAst } })).toBe(false);
  }
  expect(ok({ ...rule, whenAst: leaf })).toBe(true);
});

it("preserves unknown rule, shortcut and node metadata", () => {
  const extra = { future: { retained: true } };
  const leaf = { ...id("sampleFocus"), ...extra };
  const not = { type: "not", node: leaf, ...extra };
  const and = { type: "and", left: not, right: leaf, ...extra };
  const or = { type: "or", left: leaf, right: not, ...extra };
  for (const whenAst of [not, and, or, { type: "or", left: and, right: or, ...extra }]) {
    const decorated = { ...rule, ...extra, shortcut: { ...shortcut, ...extra }, whenAst };
    expect(ResolvedKeybindingRule.parse(decorated)).toEqual(decorated);
  }
});

it("keeps unknown and raw metadata on known nodes at any depth", () => {
  for (const mark of marks) {
    const leaf = { ...id("sampleFocus"), ...mark };
    const nodes = [
      leaf,
      { type: "not", node: leaf, ...mark },
      { type: "and", left: leaf, right: id("sampleFocus"), ...mark },
      { type: "or", left: id("sampleFocus"), right: leaf, ...mark },
    ];
    for (const node of nodes) {
      for (const whenAst of [
        node,
        { type: "not", node },
        { type: "and", left: id("sampleFocus"), right: node },
        { type: "or", left: node, right: id("sampleFocus") },
        {
          type: "or",
          left: { type: "and", left: { type: "not", node }, right: node },
          right: node,
        },
      ]) {
        expect(KeybindingWhenNode.parse(whenAst), JSON.stringify(whenAst)).toEqual(whenAst);
        const rules = [{ ...rule, whenAst }, rule];
        expect(ResolvedKeybindingsConfig.parse(rules)).toEqual(rules);
      }
    }
  }
});

it("wraps unknown node types that carry unknown and raw metadata", () => {
  for (const mark of marks) {
    const future = { ...futureNode, ...mark };
    const wrapped = { unknown: true, raw: future };
    const leaf = { ...id("sampleFocus"), ...mark };
    expect(KeybindingWhenNode.parse(future)).toEqual(wrapped);
    expect(KeybindingWhenNode.parse({ type: "and", left: leaf, right: future })).toEqual({
      type: "and",
      left: leaf,
      right: wrapped,
    });
  }
});

it("rejects malformed known nodes that carry unknown and raw metadata", () => {
  const mark = { unknown: true, raw: futureNode };
  const leaf = id("sampleFocus");
  for (const whenAst of [
    { ...id(""), ...mark },
    { type: "not", ...mark },
    { type: "and", left: leaf, ...mark },
    { type: "or", right: leaf, ...mark },
  ]) {
    expect(ok({ ...rule, whenAst }), JSON.stringify(whenAst)).toBe(false);
    expect(ok({ ...rule, whenAst: { type: "not", node: whenAst } })).toBe(false);
  }
});

it("bounds the decoded list at 256 rules after omitting malformed ones", () => {
  const rules = (count: number) => Array.from({ length: count }, () => rule);
  const bad = { ...rule, command: 7 };
  expect(ResolvedKeybindingsConfig.parse(rules(256))).toHaveLength(256);
  expect(ResolvedKeybindingsConfig.safeParse(rules(257)).success).toBe(false);
  expect(ResolvedKeybindingsConfig.parse([bad, ...rules(256), bad, bad])).toHaveLength(256);
  expect(ResolvedKeybindingsConfig.parse([])).toEqual([]);
});
