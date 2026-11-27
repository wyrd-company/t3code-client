import { describe, expect, it } from "vite-plus/test";
import { T3RpcError } from "../errors.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { TerminalClearedEvent, TerminalSessionSnapshot } from "./terminal.ts";

const terminal = { threadId: "thread-1", terminalId: "term-1" };
const write = rpcMethods["terminal.write"].payload;

describe("terminal contract in 0.1.13", () => {
  it("validates paste phases, conditional writes and plain aborts", () => {
    for (const phase of ["start", "continue", "end", "abort"]) {
      expect(
        write.parse({ ...terminal, data: "sample", bracketedPaste: phase, expectedPid: 7 }),
      ).toMatchObject({ bracketedPaste: phase, expectedPid: 7 });
    }
    expect(write.parse({ ...terminal, data: "", plainWrite: "abort" }).plainWrite).toBe("abort");
    for (const input of [
      { data: "" },
      { data: "sample", plainWrite: "abort" },
      { data: "sample", bracketedPaste: "invalid" },
      { data: "sample", plainWrite: "invalid" },
      { data: "sample", expectedPid: 0 },
      { data: "sample", expectedPid: 1.5 },
      { data: "a".repeat(65_537) },
    ]) {
      expect(write.safeParse({ ...terminal, ...input }).success).toBe(false);
    }
    expect(
      new T3RpcError("terminal.write", { _tag: "TerminalProcessChangedError" }).is(
        "TerminalProcessChangedError",
      ),
    ).toBe(true);
  });

  it("types the replay capability, omitted sequence state and scrollback clear", () => {
    for (const method of ["terminal.observe", "terminal.attach"] as const) {
      const input = rpcMethods[method].payload;
      expect(input.parse({ ...terminal, supportsSnapshotSequenceState: true })).toEqual({
        ...terminal,
        supportsSnapshotSequenceState: true,
      });
      expect(input.safeParse({ ...terminal, supportsSnapshotSequenceState: 1 }).success).toBe(
        false,
      );
    }
    const snapshot = {
      ...terminal,
      cwd: "/srv/sample",
      worktreePath: null,
      status: "running",
      pid: 7,
      history: "",
      exitCode: null,
      exitSignal: null,
      label: "Sample terminal",
      updatedAt: "2030-01-01T00:00:00Z",
      supportsConditionalWrites: true,
      historySequenceState: (0xdbff << 3) | 6,
    };
    expect(TerminalSessionSnapshot.parse(snapshot)).toEqual(snapshot);
    expect(
      TerminalSessionSnapshot.safeParse({ ...snapshot, supportsConditionalWrites: 1 }).success,
    ).toBe(false);
    expect(
      TerminalSessionSnapshot.safeParse({ ...snapshot, historySequenceState: 0 }).success,
    ).toBe(false);
    expect(
      TerminalSessionSnapshot.safeParse({
        ...snapshot,
        historySequenceState: snapshot.historySequenceState + 1,
      }).success,
    ).toBe(false);
    const cleared = { ...terminal, type: "cleared", pendingControlSequence: "\x1b" };
    expect(TerminalClearedEvent.parse(cleared)).toEqual(cleared);
    expect(TerminalClearedEvent.safeParse({ ...cleared, pendingControlSequence: 1 }).success).toBe(
      false,
    );
  });
});
