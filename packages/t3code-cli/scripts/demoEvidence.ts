// ---
// relationships:
//   verifies: command-line
// ---
export interface DemoCommand {
  command: string[];
  exitCode: number;
  stdout: string;
  threadId?: string;
}

/** Accept only successful real commands, a generic answer and its completed thread. */
export function verifyDemoCommands(commands: DemoCommand[]) {
  const expected = [
    ["--version"],
    ["run", "Reply with HELLO only.", "--model", "gpt-6-luna"],
    ["thread", "list"],
  ];
  if (commands.length !== expected.length) throw new Error("Demo command count differs.");
  if (
    commands.some(
      (result, index) => JSON.stringify(result.command) !== JSON.stringify(expected[index]),
    )
  )
    throw new Error("Demo command sequence differs.");
  if (commands.some((result) => result.exitCode !== 0)) throw new Error("Demo command failed.");
  const run = commands[1]!;
  if (run.stdout.trim() !== "HELLO") throw new Error("Demo answer must be generic.");
  if (!run.threadId) throw new Error("Demo thread identity is missing.");
  const [threadId, state] = commands[2]!.stdout.trim().split(/\s+/u);
  if (threadId !== run.threadId || state !== "completed")
    throw new Error("Demo thread completion differs.");
  return { threadId, state, model: "gpt-6-luna", assistantMessage: run.stdout.trim() };
}
