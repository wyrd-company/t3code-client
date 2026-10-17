// ---
// relationships:
//   verifies: command-line
// ---
import type { DemoCommand } from "../../packages/t3code-cli/scripts/demoEvidence.ts";
export const inputs = { server: "http://127.0.0.1:3000", project: "/tmp/demo/sample-project" };
export function evidence(): DemoCommand[] {
  const subject = {
    threadId: "sample-thread",
    runId: "sample-run",
    projectId: "sample-project",
    workspaceRoot: inputs.project,
    model: "gpt-6-luna",
    state: "completed",
  };
  const rows = [
    {
      command: [
        "auth",
        "pair",
        "--server",
        inputs.server,
        "--pairing-token-stdin",
        "--name",
        "demo",
      ],
      stdout: `Paired demo (${inputs.server}).\n`,
    },
    {
      command: [
        "thread",
        "start",
        "Reply with HELLO only.",
        "--project-path",
        inputs.project,
        "--model",
        "gpt-6-luna",
        "--json",
      ],
      stdout:
        JSON.stringify({ data: { threadId: "sample-thread", runId: "sample-run" }, exitCode: 0 }) +
        "\n",
      subject: { ...subject, state: "running" },
    },
    { command: ["thread", "wait", "sample-thread"], stdout: "HELLO\n", subject },
    {
      command: [
        "run",
        "Reply with HELLO only.",
        "--thread",
        "sample-thread",
        "--model",
        "gpt-6-luna",
      ],
      stdout: "HELLO\n",
      subject: { ...subject, runId: "continued-run" },
    },
    { command: ["project", "list"], stdout: `sample-project\tsample-project\t${inputs.project}\n` },
    { command: ["thread", "list"], stdout: "sample-thread\tcompleted\tNew thread\n" },
  ];
  return rows.map((row, index) => ({
    ...row,
    commandId: `command-${index}`,
    exitCode: 0,
    profile: {
      name: "demo",
      url: inputs.server,
      server: "profile",
      credentials: "profile",
      authenticated: true,
    },
  }));
}
