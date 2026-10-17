// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { defineMethod } from "../spec.ts";
import {
  TerminalAttachInput,
  TerminalAttachStreamEvent,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "../../schemas/terminal.ts";

export const terminalMethods = {
  "terminal.open": defineMethod({
    payload: TerminalOpenInput,
    success: TerminalSessionSnapshot,
    stream: false,
    scope: "terminal:operate",
  }),
  "terminal.attach": defineMethod({
    payload: TerminalAttachInput,
    success: TerminalAttachStreamEvent,
    stream: true,
    scope: "terminal:operate",
  }),
  "terminal.write": defineMethod({
    payload: TerminalWriteInput,
    // Effect's JSON codec encodes Schema.Void as null; callers still receive void.
    success: z
      .null()
      .or(z.void())
      .transform((): void => undefined),
    stream: false,
    scope: "terminal:operate",
  }),
  "terminal.resize": defineMethod({
    payload: TerminalResizeInput,
    // Effect's JSON codec encodes Schema.Void as null; callers still receive void.
    success: z
      .null()
      .or(z.void())
      .transform((): void => undefined),
    stream: false,
    scope: "terminal:operate",
  }),
  "terminal.close": defineMethod({
    payload: TerminalCloseInput,
    // Effect's JSON codec encodes Schema.Void as null; callers still receive void.
    success: z
      .null()
      .or(z.void())
      .transform((): void => undefined),
    stream: false,
    scope: "terminal:operate",
  }),
  subscribeTerminalEvents: defineMethod({
    payload: z.looseObject({}),
    success: TerminalEvent,
    stream: true,
    scope: "terminal:read",
  }),
} as const;
