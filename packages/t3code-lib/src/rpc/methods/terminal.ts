// ---
// relationships:
//   implements: library
// ---
import { VoidSuccess, defineMethod } from "../spec.ts";
import {
  TerminalAttachInput,
  TerminalAttachStreamEvent,
  TerminalCloseInput,
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
    success: VoidSuccess,
    stream: false,
    scope: "terminal:operate",
  }),
  "terminal.resize": defineMethod({
    payload: TerminalResizeInput,
    success: VoidSuccess,
    stream: false,
    scope: "terminal:operate",
  }),
  "terminal.close": defineMethod({
    payload: TerminalCloseInput,
    success: VoidSuccess,
    stream: false,
    scope: "terminal:operate",
  }),
} as const;
