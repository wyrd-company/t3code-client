import { describe, expect, it } from "vite-plus/test";
import { OrchestrationThreadActivity } from "../threadActivity.ts";
import { reactorActivityPayloads } from "./reactors.ts";

type ReactorActivityKind = keyof typeof reactorActivityPayloads;

const samples: Record<ReactorActivityKind, Record<string, unknown>> = {
  "checkpoint.capture.failed": { detail: "Unable to read the working tree." },
  "checkpoint.captured": { turnCount: 2, status: "ready" },
  "checkpoint.revert.failed": { turnCount: 1, detail: "Checkpoint ref is missing." },
  "provider.auth.signed-out": { providerInstanceId: "sample-provider" },
  "provider.session.stop.failed": { detail: "Session did not stop in time." },
  "provider.turn.interrupt.failed": {
    detail: "No active provider session is bound to this thread.",
  },
  "provider.turn.start.failed": {
    detail: "User message 'message-1' was not found for turn start request.",
    requestId: "message-1",
  },
  "user-input.answer-submitted": {
    requestId: "request-1",
    answers: { "question-1": "Use the attached notes." },
    questionTextById: { "question-1": "Which notes should be used?" },
    attachmentsByQuestionId: {
      "question-1": [
        {
          type: "file",
          id: "attachment-1",
          name: "notes.txt",
          mimeType: "text/plain",
          sizeBytes: 42,
        },
      ],
    },
    detail: "notes.txt",
  },
  "setup-script.requested": {
    scriptId: "setup",
    scriptName: "Setup",
    terminalId: "terminal-1",
    worktreePath: "/work/sample-worktree",
  },
  "setup-script.started": {
    scriptId: "setup",
    scriptName: "Setup",
    terminalId: "terminal-1",
    worktreePath: "/work/sample-worktree",
  },
  "setup-script.failed": {
    detail: "The setup script could not be launched.",
    worktreePath: "/work/sample-worktree",
  },
  "worktree-setup": {
    threadId: "thread-1",
    phase: "running",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: null,
    branch: "feature/sample",
    baseRef: "main",
    worktreePath: "/work/sample-worktree",
    setupScript: { name: "Setup", command: "echo ready", terminalId: "terminal-1" },
    stages: [
      {
        id: "checkout",
        status: "done",
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:01.000Z",
        percent: 100,
        detail: null,
        tail: [],
      },
    ],
    error: null,
    sequence: 3,
  },
};

function activity(kind: string, payload: unknown): unknown {
  return {
    id: "event-1",
    tone: "info",
    kind,
    summary: "Sample activity",
    payload,
    turnId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("reactorActivityPayloads", () => {
  it("has a sample for every kind", () => {
    expect(Object.keys(samples).toSorted()).toEqual(
      Object.keys(reactorActivityPayloads).toSorted(),
    );
  });

  for (const kind of Object.keys(samples) as ReactorActivityKind[]) {
    it(`decodes a ${kind} activity as a known kind`, () => {
      const payload = samples[kind];
      expect(reactorActivityPayloads[kind].safeParse(payload).success).toBe(true);
      const decoded = OrchestrationThreadActivity.parse(activity(kind, payload));
      expect(decoded.unknown).toBeUndefined();
      expect(decoded.kind).toBe(kind);
      expect(decoded.payload).toMatchObject(payload);
    });
  }

  it("downgrades a known kind with a mismatched payload to unknown", () => {
    const decoded = OrchestrationThreadActivity.parse(
      activity("checkpoint.captured", { turnCount: "two" }),
    );
    expect(decoded.unknown).toBe(true);
  });
});
