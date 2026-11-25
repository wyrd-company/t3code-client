// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { rpcMethods } from "../rpc/registry.ts";
import { decodeRpcErrorRecord, isRpcErrorOfTag } from "./rpcErrors.ts";
import {
  WorkflowIssueAddress,
  WorkflowRunsUpdate,
  applyWorkflowRunsUpdate,
  isWorkflowRunsChange,
  type WorkflowRun,
  type WorkflowRunsSnapshot,
} from "./workflow.ts";

function run(runId: string, startedAt: string, overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    runId,
    workflow: "sample-workflow",
    version: 1,
    title: `Run ${runId}`,
    status: "running",
    detail: null,
    result: null,
    pauses: 0,
    retired: false,
    resumesAt: null,
    parentRunId: null,
    parentStep: null,
    startedAt,
    updatedAt: startedAt,
    endedAt: null,
    ...overrides,
  };
}
const question = (runId: string, name: string, askedAt: string) => ({
  runId,
  name,
  request: { title: "Ship it?", choices: ["yes", "no"] },
  askedAt,
  thread: null,
});

describe("workflow runs (0.1.12)", () => {
  it("decodes whole lists and change frames from workflows.subscribe", () => {
    const success = rpcMethods["workflows.subscribe"].success;
    const snapshot = {
      workflows: [{ name: "sample-workflow", version: 1, triggers: ["every 1h"] }],
      runs: [run("run-1", "2020-01-01T00:00:00.000Z", { tags: ["sample"] })],
      questions: [question("run-1", "ship", "2020-01-01T00:01:00.000Z")],
      definition: { revision: 3, problem: null },
    };
    const whole = success.parse(snapshot);
    expect(whole).toEqual(snapshot);
    expect(isWorkflowRunsChange(whole)).toBe(false);
    const change = { _tag: "changed", runs: [], removed: ["run-1"], questions: [], closed: [] };
    const parsed = success.parse(change);
    expect(isWorkflowRunsChange(parsed)).toBe(true);
    expect(rpcMethods["workflows.subscribe"].payload.parse({ changes: true })).toEqual({
      changes: true,
    });
    expect(WorkflowRunsUpdate.safeParse({ _tag: "changed", runs: [] }).success).toBe(false);
  });

  it("applies a change frame: replaces, adds newest first and drops removed runs and closed questions", () => {
    const base: WorkflowRunsSnapshot = {
      workflows: [],
      runs: [run("run-2", "2020-01-02T00:00:00.000Z"), run("run-1", "2020-01-01T00:00:00.000Z")],
      questions: [
        question("run-1", "ship", "2020-01-01T00:01:00.000Z"),
        question("run-2", "review", "2020-01-02T00:01:00.000Z"),
      ],
    };
    const next = applyWorkflowRunsUpdate(base, {
      _tag: "changed",
      runs: [
        run("run-3", "2020-01-03T00:00:00.000Z"),
        run("run-2", "2020-01-02T00:00:00.000Z", { status: "paused" }),
      ],
      removed: ["run-1"],
      questions: [question("run-3", "ship", "2020-01-03T00:01:00.000Z")],
      closed: [{ runId: "run-1", name: "ship" }],
    });
    expect(next.runs.map((entry) => [entry.runId, entry.status])).toEqual([
      ["run-3", "running"],
      ["run-2", "paused"],
    ]);
    expect(next.questions.map((entry) => `${entry.runId}/${entry.name}`)).toEqual([
      "run-2/review",
      "run-3/ship",
    ]);
    const whole = { workflows: [], runs: [], questions: [] };
    expect(applyWorkflowRunsUpdate(base, whole)).toBe(whole);
    const fromNothing = applyWorkflowRunsUpdate(undefined, {
      _tag: "changed",
      runs: [run("run-9", "2020-01-09T00:00:00.000Z")],
      removed: [],
      questions: [],
      closed: [],
    });
    expect(fromNothing.runs.map((entry) => entry.runId)).toEqual(["run-9"]);
  });

  it("reads a run's detail with steps and references, and counts", () => {
    const detail = {
      run: run("run-1", "2020-01-01T00:00:00.000Z", { status: "completed", result: { ok: true } }),
      steps: [
        {
          name: "review",
          kind: "agent",
          status: "completed",
          attempts: 1,
          detail: null,
          threadId: "thread-1",
          environmentId: null,
          result: { verdict: "pass" },
          said: "Done.",
          startedAt: "2020-01-01T00:00:00.000Z",
          endedAt: "2020-01-01T00:05:00.000Z",
        },
      ],
      references: [
        {
          kind: "issue",
          key: "sample/repo#1",
          address: { projectId: "project-1", tracker: "github", key: "1" },
          title: "Sample issue",
          url: null,
          state: "open",
          steps: ["review"],
          origin: "trigger",
        },
      ],
    };
    expect(rpcMethods["workflows.get"].success.parse(detail)).toEqual(detail);
    expect(WorkflowIssueAddress).toBeDefined();
    const counts = { needsYou: 1, active: 2, total: 9 };
    expect(rpcMethods["workflows.counts"].success.parse(counts)).toEqual(counts);
    expect(rpcMethods["workflows.counts"].stream).toBe(true);
  });

  it("answers, resumes and cancels runs, and reads and changes definition files", () => {
    expect(
      rpcMethods["workflows.answer"].payload.parse({ runId: "run-1", name: "ship", choice: "yes" }),
    ).toEqual({ runId: "run-1", name: "ship", choice: "yes" });
    expect(rpcMethods["workflows.answer"].payload.safeParse({ runId: "run-1" }).success).toBe(
      false,
    );
    expect(rpcMethods["workflows.cancel"].payload.parse({ runId: "run-1", reason: "No." })).toEqual(
      { runId: "run-1", reason: "No." },
    );
    expect(rpcMethods["workflows.resume"].success.parse(null)).toBeUndefined();
    const files = {
      directory: "/srv/home/workflows",
      single: false,
      files: [
        { name: "sample.ts", source: "export default {}", workflows: ["sample@1"], problems: [] },
      ],
      problems: [{ message: "Defined twice.", file: "sample.ts", line: 3 }],
      revision: 2,
      problem: null,
    };
    expect(rpcMethods["workflows.getDefinition"].success.parse(files)).toEqual(files);
    const change = { changed: true, problems: [] };
    expect(rpcMethods["workflows.saveDefinition"].success.parse(change)).toEqual(change);
    expect(
      rpcMethods["workflows.saveDefinition"].payload.safeParse({ name: "sample.ts" }).success,
    ).toBe(false);
    const failure = decodeRpcErrorRecord({ _tag: "WorkflowRequestError", message: "No such run." });
    expect(isRpcErrorOfTag(failure, "WorkflowRequestError") && failure.message).toBe(
      "No such run.",
    );
  });
});
