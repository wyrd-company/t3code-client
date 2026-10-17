// ---
// relationships:
//   verifies: command-line
// ---
import { expect, it } from "vite-plus/test";
import {
  verifyDemoCommands,
  type DemoCommand,
} from "../../packages/t3code-cli/scripts/demoEvidence.ts";
import { evidence, inputs } from "./demoFixture.ts";
it("accepts real pairing start wait project and continuation linkage", () => {
  expect(verifyDemoCommands(evidence(), inputs)).toMatchObject({
    threadId: "sample-thread",
    runId: "sample-run",
    state: "completed",
    continuationRunId: "continued-run",
    assistantMessage: "HELLO",
  });
});
for (const [index, name] of [
  "pair",
  "start",
  "wait",
  "run",
  "project list",
  "thread list",
].entries()) {
  it(`rejects omitted ${name}`, () => {
    const rows = evidence();
    rows.splice(index, 1);
    expect(() => verifyDemoCommands(rows, inputs)).toThrow("count");
  });
  it(`rejects substituted ${name}`, () => {
    const rows = evidence();
    rows[index]!.command[0] = "other";
    expect(() => verifyDemoCommands(rows, inputs)).toThrow(`sequence differs at ${index}`);
  });
  it(`rejects nonzero ${name}`, () => {
    const rows = evidence();
    rows[index]!.exitCode = 8;
    expect(() => verifyDemoCommands(rows, inputs)).toThrow(`failed at ${index}`);
  });
}
const failures: [string, (rows: DemoCommand[]) => void, string][] = [
  [
    "duplicate command ids",
    (r) => {
      r[1]!.commandId = r[0]!.commandId;
    },
    "identities",
  ],
  [
    "pair outcome",
    (r) => {
      r[0]!.stdout = "other";
    },
    "pairing outcome",
  ],
  [
    "paired server",
    (r) => {
      r[1]!.profile.url = "http://127.0.0.1:4000";
    },
    "paired profile",
  ],
  [
    "paired name",
    (r) => {
      r[1]!.profile.name = "other";
    },
    "paired profile",
  ],
  [
    "token override",
    (r) => {
      r[2]!.profile.credentials = "environment";
    },
    "paired profile",
  ],
  [
    "server override",
    (r) => {
      r[3]!.profile.server = "environment";
    },
    "paired profile",
  ],
  [
    "unauthenticated profile",
    (r) => {
      r[0]!.profile.authenticated = false;
    },
    "paired profile",
  ],
  [
    "start stdout identity",
    (r) => {
      r[1]!.stdout = JSON.stringify({
        data: { threadId: "other", runId: "sample-run" },
        exitCode: 0,
      });
      r[2]!.command[2] = "other";
      r[3]!.command[3] = "other";
    },
    "started identity",
  ],
  [
    "returned start run",
    (r) => {
      r[1]!.stdout = JSON.stringify({
        data: { threadId: "sample-thread", runId: "other" },
        exitCode: 0,
      });
    },
    "started identity",
  ],
  [
    "returned start exit",
    (r) => {
      r[1]!.stdout = JSON.stringify({
        data: { threadId: "sample-thread", runId: "sample-run" },
        exitCode: 8,
      });
    },
    "started identity",
  ],
  [
    "malformed start JSON",
    (r) => {
      r[1]!.stdout = "other";
    },
    "start output",
  ],
  [
    "missing start run",
    (r) => {
      r[1]!.subject!.runId = "";
    },
    "started identity",
  ],
  [
    "selected project",
    (r) => {
      r[1]!.subject!.workspaceRoot = "/tmp/other";
    },
    "selected project",
  ],
  [
    "selected model",
    (r) => {
      r[1]!.subject!.model = "other";
    },
    "selected project",
  ],
  [
    "waited run",
    (r) => {
      r[2]!.subject!.runId = "other";
    },
    "waited run",
  ],
  [
    "continued run",
    (r) => {
      r[3]!.subject!.runId = "sample-run";
    },
    "continuation run",
  ],
  [
    "listed project id",
    (r) => {
      r[4]!.stdout = `other\tsample-project\t${inputs.project}`;
    },
    "project listing",
  ],
  [
    "listed project title",
    (r) => {
      r[4]!.stdout = `sample-project\tother\t${inputs.project}`;
    },
    "project listing",
  ],
  [
    "listed project path",
    (r) => {
      r[4]!.stdout = "sample-project\tsample-project\t/tmp/other";
    },
    "project listing",
  ],
  [
    "listed thread",
    (r) => {
      r[5]!.stdout = "other completed";
    },
    "thread completion",
  ],
  [
    "listed terminal state",
    (r) => {
      r[5]!.stdout = "sample-thread running";
    },
    "thread completion",
  ],
];
for (const index of [2, 3]) {
  failures.push(
    [
      `answer ${index}`,
      (r) => {
        r[index]!.stdout = "other";
      },
      "generic",
    ],
    [
      `thread ${index}`,
      (r) => {
        r[index]!.subject!.threadId = "other";
      },
      "subject linkage",
    ],
    [
      `project ${index}`,
      (r) => {
        r[index]!.subject!.projectId = "other";
      },
      "subject linkage",
    ],
    [
      `workspace ${index}`,
      (r) => {
        r[index]!.subject!.workspaceRoot = "/tmp/other";
      },
      "subject linkage",
    ],
    [
      `model ${index}`,
      (r) => {
        r[index]!.subject!.model = "other";
      },
      "subject linkage",
    ],
    [
      `terminal ${index}`,
      (r) => {
        r[index]!.subject!.state = "running";
      },
      "terminal completed",
    ],
  );
}
for (const [name, mutate, assertion] of failures) {
  it(`rejects ${name}`, () => {
    const rows = evidence();
    mutate(rows);
    expect(() => verifyDemoCommands(rows, inputs)).toThrow(assertion);
  });
}
