// ---
// relationships:
//   verifies: command-line
// ---
import { expect, it } from "vite-plus/test";
import {
  verifyDemoCommands,
  type DemoCommand,
} from "../../packages/t3code-cli/scripts/demoEvidence.ts";
function evidence(): DemoCommand[] {
  return [
    {
      command: ["run", "Reply with HELLO only.", "--model", "gpt-6-luna"],
      exitCode: 0,
      stdout: "HELLO\n",
      threadId: "sample-thread",
    },
    { command: ["thread", "list"], exitCode: 0, stdout: "sample-thread  completed  New thread\n" },
  ];
}
it("accepts the real-command evidence contract and preserves subject identity", () => {
  expect(verifyDemoCommands(evidence())).toEqual({
    threadId: "sample-thread",
    state: "completed",
    model: "gpt-6-luna",
    assistantMessage: "HELLO",
  });
});
it("rejects an incomplete recording", () => {
  expect(() => verifyDemoCommands(evidence().slice(0, 1))).toThrow("count");
});
it("rejects substituted demo commands or model", () => {
  const rows = evidence();
  rows[0]!.command[3] = "other";
  expect(() => verifyDemoCommands(rows)).toThrow("sequence");
});
it("rejects a failed real command", () => {
  const rows = evidence();
  rows[0]!.exitCode = 8;
  expect(() => verifyDemoCommands(rows)).toThrow("failed");
});
it("rejects a non-generic assistant answer", () => {
  const rows = evidence();
  rows[0]!.stdout = "A different reply";
  expect(() => verifyDemoCommands(rows)).toThrow("generic");
});
it("rejects missing real thread identity", () => {
  const rows = evidence();
  delete rows[0]!.threadId;
  expect(() => verifyDemoCommands(rows)).toThrow("identity");
});
it("rejects completion evidence for another thread", () => {
  const rows = evidence();
  rows[1]!.stdout = "other-thread completed";
  expect(() => verifyDemoCommands(rows)).toThrow("completion");
});
it("rejects a thread that has not completed", () => {
  const rows = evidence();
  rows[1]!.stdout = "sample-thread running";
  expect(() => verifyDemoCommands(rows)).toThrow("completion");
});
