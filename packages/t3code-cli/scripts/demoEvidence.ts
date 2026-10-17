// ---
// relationships:
//   verifies: command-line
// ---
export interface DemoCommand {
  commandId: string;
  command: string[];
  exitCode: number;
  stdout: string;
  profile: {
    name: string;
    url: string;
    server: string;
    credentials: string;
    authenticated: boolean;
  };
  subject?: {
    threadId: string;
    runId: string;
    projectId: string;
    workspaceRoot: string;
    model: string;
    state: string;
  };
}
export interface DemoInputs {
  server: string;
  project: string;
}

/** Verify actual CLI outputs against independently observed server/profile identities. */
export function verifyDemoCommands(commands: DemoCommand[], inputs: DemoInputs) {
  if (commands.length !== 6) throw new Error("Demo command count differs.");
  if (
    commands.some((row) => !row.commandId) ||
    new Set(commands.map((row) => row.commandId)).size !== commands.length
  )
    throw new Error("Demo command identities differ.");
  const [pair, start, wait, run, projects, threads] = commands as [
    DemoCommand,
    DemoCommand,
    DemoCommand,
    DemoCommand,
    DemoCommand,
    DemoCommand,
  ];
  let started: { data?: { threadId?: string; runId?: string }; exitCode?: number };
  try {
    started = JSON.parse(start.stdout);
  } catch {
    throw new Error("Demo start output is not JSON.");
  }
  const expected = [
    ["auth", "pair", "--server", inputs.server, "--pairing-token-stdin", "--name", "demo"],
    [
      "thread",
      "start",
      "Reply with HELLO only.",
      "--project-path",
      inputs.project,
      "--model",
      "gpt-6-luna",
      "--json",
    ],
    ["thread", "wait", started.data?.threadId],
    ["run", "Reply with HELLO only.", "--thread", started.data?.threadId, "--model", "gpt-6-luna"],
    ["project", "list"],
    ["thread", "list"],
  ];
  for (const [index, result] of commands.entries()) {
    if (JSON.stringify(result.command) !== JSON.stringify(expected[index]))
      throw new Error(`Demo command sequence differs at ${index}.`);
    if (result.exitCode !== 0) throw new Error(`Demo command failed at ${index}.`);
    if (
      result.profile.name !== "demo" ||
      result.profile.url !== inputs.server ||
      result.profile.server !== "profile" ||
      result.profile.credentials !== "profile" ||
      !result.profile.authenticated
    )
      throw new Error("Demo must use the authenticated paired profile.");
  }
  if (pair.stdout.trim() !== `Paired demo (${inputs.server}).`)
    throw new Error("Demo pairing outcome differs.");
  const subject = start.subject;
  if (
    !subject?.threadId ||
    !subject.runId ||
    started.data?.threadId !== subject.threadId ||
    started.data?.runId !== subject.runId ||
    started.exitCode !== 0
  )
    throw new Error("Demo started identity is missing or differs.");
  if (
    !subject.projectId ||
    subject.workspaceRoot !== inputs.project ||
    subject.model !== "gpt-6-luna"
  )
    throw new Error("Demo selected project or model differs.");
  for (const result of [wait, run]) {
    if (result.stdout.trim() !== "HELLO") throw new Error("Demo answer must be generic.");
    if (
      result.subject?.threadId !== subject.threadId ||
      result.subject.projectId !== subject.projectId ||
      result.subject.workspaceRoot !== inputs.project ||
      result.subject.model !== "gpt-6-luna"
    )
      throw new Error("Demo subject linkage differs.");
    if (result.subject.state !== "completed")
      throw new Error("Demo run is not terminal completed.");
  }
  if (wait.subject!.runId !== subject.runId)
    throw new Error("Demo waited run differs from started run.");
  if (!run.subject!.runId || run.subject!.runId === subject.runId)
    throw new Error("Demo continuation run identity differs.");
  const projectRows = projects.stdout
    .trim()
    .split("\n")
    .map((line) => line.split("\t"));
  if (
    !projectRows.some(
      ([id, title, path]) =>
        id === subject.projectId && title === "sample-project" && path === inputs.project,
    )
  )
    throw new Error("Demo project listing differs from selected project.");
  const threadRows = threads.stdout
    .trim()
    .split("\n")
    .map((line) => line.split(/\s+/u));
  if (!threadRows.some(([id, state]) => id === subject.threadId && state === "completed"))
    throw new Error("Demo thread completion differs.");
  return {
    ...subject,
    state: "completed",
    assistantMessage: wait.stdout.trim(),
    continuationRunId: run.subject!.runId,
  };
}
