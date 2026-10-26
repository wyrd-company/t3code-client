// ---
// relationships:
//   implements: library
// ---
/**
 * Resolved keybindings. Mirrors `packages/contracts/src/keybindings.ts` in
 * T3 Code: the rules the server compiles from its keybindings file and sends
 * with configuration reads, snapshots and `keybindingsUpdated` events.
 */
import { z } from "zod";
import {
  TrimmedNonEmptyString,
  forwardCompatibleArray,
  forwardCompatibleLiteral,
  type KnownOr,
  type UnknownVariant,
} from "./common.ts";

const MAX_KEYBINDING_VALUE_LENGTH = 64;
export const MAX_KEYBINDINGS_COUNT = 256;

const THREAD_JUMP_KEYBINDING_COMMANDS = [
  "thread.jump.1",
  "thread.jump.2",
  "thread.jump.3",
  "thread.jump.4",
  "thread.jump.5",
  "thread.jump.6",
  "thread.jump.7",
  "thread.jump.8",
  "thread.jump.9",
] as const;
const MODEL_PICKER_JUMP_KEYBINDING_COMMANDS = [
  "modelPicker.jump.1",
  "modelPicker.jump.2",
  "modelPicker.jump.3",
  "modelPicker.jump.4",
  "modelPicker.jump.5",
  "modelPicker.jump.6",
  "modelPicker.jump.7",
  "modelPicker.jump.8",
  "modelPicker.jump.9",
] as const;

/** Commands the server knows by name. Script commands (`script.<id>.run`) are open strings. */
export const STATIC_KEYBINDING_COMMANDS = [
  "sidebar.toggle",
  "navigation.back",
  "navigation.forward",
  "terminal.toggle",
  "terminal.split",
  "terminal.splitVertical",
  "terminal.new",
  "terminal.close",
  "rightPanel.toggle",
  "rightPanel.new",
  "threadPanel.toggle",
  "rightPanel.toggleMaximized",
  "rightPanel.close",
  "view.reopenClosed",
  "pullRequest.copyNumber",
  "diff.toggle",
  "preview.toggle",
  "preview.refresh",
  "preview.focusUrl",
  "preview.zoomIn",
  "preview.zoomOut",
  "preview.resetZoom",
  "commandPalette.toggle",
  "filePicker.toggle",
  "projectSearch.toggle",
  "usage.open",
  "theme.select",
  "appearance.cycle",
  "themeEditor.toggle",
  "composer.stash",
  "composer.sendAlternate",
  "composer.sendBackground",
  "composer.sendAndNewThread",
  "composer.host",
  "composer.cycleHost",
  "composer.effort",
  "composer.increaseEffort",
  "composer.decreaseEffort",
  "composer.mode",
  "composer.workspace",
  "composer.previousWorktree",
  "composer.branch",
  "chat.new",
  "chat.newLocal",
  "chat.newWithoutProject",
  "chat.find",
  "editor.openFavorite",
  "usage.cost",
  "usage.tokens",
  "usage.limits",
  "usage.period.day",
  "usage.period.week",
  "usage.period.month",
  "usage.period.quarter",
  "modelPicker.toggle",
  "modelPicker.previousProvider",
  "modelPicker.nextProvider",
  ...MODEL_PICKER_JUMP_KEYBINDING_COMMANDS,
  "thread.stop",
  "thread.steerQueuedMessage",
  "thread.editQueuedMessage",
  "thread.previous",
  "thread.next",
  "thread.copyReference",
  "thread.settle",
  "thread.pin",
  "thread.undo",
  ...THREAD_JUMP_KEYBINDING_COMMANDS,
] as const;
export type StaticKeybindingCommand = (typeof STATIC_KEYBINDING_COMMANDS)[number];

/** A known command name, a script command, or a command from a newer server. */
export const KeybindingCommand = forwardCompatibleLiteral(STATIC_KEYBINDING_COMMANDS);
export type KeybindingCommand = KnownOr<StaticKeybindingCommand>;

export const KeybindingShortcut = z.looseObject({
  key: TrimmedNonEmptyString.max(MAX_KEYBINDING_VALUE_LENGTH),
  metaKey: z.boolean(),
  ctrlKey: z.boolean(),
  shiftKey: z.boolean(),
  altKey: z.boolean(),
  modKey: z.boolean(),
});
export type KeybindingShortcut = z.infer<typeof KeybindingShortcut>;

/** A known `when` node. Child nodes may be unknown members. */
export type KnownKeybindingWhenNode =
  | { type: "identifier"; name: string; [key: string]: unknown }
  | { type: "not"; node: KeybindingWhenNode; [key: string]: unknown }
  | { type: "and"; left: KeybindingWhenNode; right: KeybindingWhenNode; [key: string]: unknown }
  | { type: "or"; left: KeybindingWhenNode; right: KeybindingWhenNode; [key: string]: unknown };
export type KeybindingWhenNode = KnownKeybindingWhenNode | UnknownVariant<"type">;

const whenNode = z.lazy((): z.ZodType<KeybindingWhenNode> => KeybindingWhenNode);
const knownWhenNodes = [
  z.looseObject({ type: z.literal("identifier"), name: z.string().min(1) }),
  z.looseObject({ type: z.literal("not"), node: whenNode }),
  z.looseObject({ type: z.literal("and"), left: whenNode, right: whenNode }),
  z.looseObject({ type: z.literal("or"), left: whenNode, right: whenNode }),
] as const;
const knownWhenNodeTypes = new Set<string>(knownWhenNodes.map((node) => node.shape.type.value));
/**
 * A node's `type` alone selects its schema, so a known node keeps extra
 * `unknown` and `raw` keys as metadata instead of reading as an unknown variant.
 */
const unknownWhenNode = z
  .looseObject({
    type: z.string().refine((type) => !knownWhenNodeTypes.has(type), {
      message: "Known when node type did not match its schema",
    }),
  })
  .transform((raw) => ({ unknown: true as const, raw }));
/**
 * The parsed `when` condition. Unknown node types decode as `{ unknown: true, raw }`
 * at any depth; a malformed known node fails, so its rule is dropped.
 */
export const KeybindingWhenNode: z.ZodType<KeybindingWhenNode> = z.union([
  z.discriminatedUnion("type", knownWhenNodes),
  unknownWhenNode,
]);

export const ResolvedKeybindingRule = z.looseObject({
  command: KeybindingCommand,
  shortcut: KeybindingShortcut,
  whenAst: KeybindingWhenNode.optional(),
});
export type ResolvedKeybindingRule = z.infer<typeof ResolvedKeybindingRule>;

/**
 * Malformed rules are dropped and later rules kept. More than
 * `MAX_KEYBINDINGS_COUNT` rules left after that fail decoding.
 */
export const ResolvedKeybindingsConfig = forwardCompatibleArray(ResolvedKeybindingRule).refine(
  (rules) => rules.length <= MAX_KEYBINDINGS_COUNT,
  { message: `Expected at most ${MAX_KEYBINDINGS_COUNT} keybindings` },
);
export type ResolvedKeybindingsConfig = z.infer<typeof ResolvedKeybindingsConfig>;
