// ---
// relationships:
//   verifies: command-line
//   references: cli-surface
// ---
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";

type Command = {
  name: string;
  summary?: string;
  subcommands?: Command[];
  output?: { "exit-codes": unknown[] };
};

const surface = JSON.parse(
  NodeFS.readFileSync(
    new URL("../../docs/specifications/cli-surface.json", import.meta.url),
    "utf8",
  ),
) as { commands: Command[] };

function commands(nodes: Command[], prefix = ""): [string, Command][] {
  return nodes.flatMap((node) => {
    const path = `${prefix} ${node.name}`.trim();
    return [[path, node] as [string, Command], ...commands(node.subcommands ?? [], path)];
  });
}

const entries = commands(surface.commands);

describe("normative CLI surface content", () => {
  it("retains the complete exit meanings in all four execution commands", () => {
    const meanings = [
      "Completed.",
      "Unexpected CLI error.",
      "Usage error.",
      "Run failed or rolled back.",
      "Interrupted or cancelled, including by signal.",
      "Timed out and run still active; thread id reported.",
      "Timed out and CLI interrupted the run.",
      "Blocked on user input or approval.",
      "Server unreachable or connection lost.",
      "Credential rejected or scope missing.",
      "Thread, project or model not found.",
    ];
    const outputs = entries.filter(([, node]) => node.output !== undefined);
    expect(outputs.map(([path]) => path)).toEqual([
      "run",
      "thread start",
      "thread send",
      "thread wait",
    ]);
    for (const [path, node] of outputs) {
      expect(node.output?.["exit-codes"], path).toEqual(
        meanings.map((meaning, code) => ({ code, meaning })),
      );
    }
  });

  it("retains every complete command summary", () => {
    expect(
      Object.fromEntries(
        entries.flatMap(([path, node]) => (node.summary ? [[path, node.summary]] : [])),
      ),
    ).toEqual({
      run: "Dispatch a prompt and wait for its run.",
      "thread start": "Create a thread and run, then print the thread id.",
      "thread send": "Send a prompt to an existing thread.",
      "thread wait": "Wait for the selected thread run.",
      "thread read": "Read the transcript with oversized-transcript detail fallback.",
      "thread list": "List server threads.",
      "thread find": "Find a T3 Code thread by provider instance and native session id.",
      "thread status": "Show a thread's runs, queue, pending requests and background work.",
      "thread requests": "List a thread's pending approvals and questions.",
      "thread usage": "Show provider context and turn usage for a thread.",
      "thread diff": "Print a thread's checkpoint diff.",
      "thread search": "Search thread messages across threads or within one thread.",
      "thread interrupt": "Interrupt the thread's active run with the library.",
      "thread respond": "Answer a user-input request or decide an approval.",
      "project list": "List projects.",
      "project ensure": "Find or create the project for a workspace directory.",
      "auth pair": "Validate and store a server profile credential.",
      "auth status": "Probe every profile and report its metadata and current marker.",
      "auth switch": "Select the current profile.",
      "auth logout": "Remove credentials for the named or current profile.",
      "server info": "Show environment descriptor, providers and models.",
      version:
        "Show CLI, library and target versions with an informational reachable-server verdict.",
    });
  });

  it("contains no null values, including stray comma-split keys", () => {
    function check(value: unknown, path: string): void {
      expect(value, path).not.toBeNull();
      if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) check(child, `${path}/${key}`);
      }
    }
    check(surface, "");
  });
});
