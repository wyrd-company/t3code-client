import { OrchestrationMessageContext } from "./commands/messageContext.ts";
// ---
// relationships:
//   implements: design
// ---
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { ServerConfig } from "../server.ts";
import { ExecutionEnvironmentDescriptor } from "../environment.ts";
import { ModelSelection, SnapShotAccessibility, ProjectMonogramText } from "./model.ts";
import { ClientOrchestrationCommand, ThreadMetaUpdateCommand } from "./commands.ts";
import { OrchestrationEvent } from "./events.ts";
import { OrchestrationThreadActivity, OrchestrationThreadDetailSnapshot } from "./readModel.ts";
import { OrchestrationShellSnapshot } from "./shell.ts";
import { ProviderOptionSelections, ServerProvider } from "../provider.ts";
import { openRequests, UserInputRequestedPayload } from "./activities.ts";
import { OrchestrationGetTurnDiffInput } from "./stream.ts";

function fixture(name: string): unknown {
  return JSON.parse(
    NodeFS.readFileSync(new URL(`../../../test/fixtures/${name}.json`, import.meta.url), "utf8"),
  );
}

describe("captured server payloads", () => {
  it.each([
    ["server-config", ServerConfig],
    ["orchestration-shell", OrchestrationShellSnapshot],
    ["orchestration-thread-detail", OrchestrationThreadDetailSnapshot],
    ["environment", ExecutionEnvironmentDescriptor],
  ] as const)("decodes %s", (name, schema) => {
    expect(schema.safeParse(fixture(name))).toMatchObject({ success: true });
  });
  it("retains the captured providers rather than silently dropping them", () => {
    const raw = fixture("server-config") as { providers: unknown[] };
    const parsed = ServerConfig.parse(raw);
    expect(parsed.providers).toHaveLength(raw.providers.length);
    for (const provider of raw.providers)
      expect(ServerProvider.safeParse(provider).success).toBe(true);
  });
});

describe("forward compatibility", () => {
  it("preserves an unknown event as an unknown variant", () => {
    const raw = { type: "thread.future-event", payload: { data: 1 } };
    expect(OrchestrationEvent.parse(raw)).toEqual({ unknown: true, raw });
  });
  it("rejects malformed known events", () => {
    expect(OrchestrationEvent.safeParse({ type: "thread.created", payload: {} }).success).toBe(
      false,
    );
  });
  it("keeps unknown activity kinds and tones", () => {
    const activity = {
      id: "activity-1",
      kind: "future.activity",
      tone: "future-tone",
      summary: "Example",
      payload: {},
      turnId: null,
      createdAt: "2026-01-01T00:00:00Z",
    };
    expect(OrchestrationThreadActivity.parse(activity)).toEqual({ ...activity, unknown: true });
  });
  it("keeps a known activity whose payload does not match as unknown", () => {
    const activity = {
      id: "activity-2",
      kind: "approval.requested",
      tone: "approval",
      summary: "Example",
      payload: { requestId: 42 },
      turnId: null,
      createdAt: "2026-01-01T00:00:00Z",
    };
    expect(OrchestrationThreadActivity.parse(activity)).toEqual({ ...activity, unknown: true });
  });
  it("promotes legacy model routing and retains future fields", () => {
    expect(
      ModelSelection.parse({ provider: "example", model: "model-1", future: true }),
    ).toMatchObject({ instanceId: "example", model: "model-1", future: true });
    expect(
      ModelSelection.parse({ provider: "old", instanceId: "new", model: "model-1" }).instanceId,
    ).toBe("new");
    expect(
      ModelSelection.safeParse({ instanceId: null, provider: "old", model: "model-1" }).success,
    ).toBe(false);
  });
  it("normalizes legacy provider option selections", () => {
    expect(
      ProviderOptionSelections.parse({ effort: " high ", fast: true, invalid: 42, blank: " " }),
    ).toEqual([
      { id: "effort", value: "high" },
      { id: "fast", value: true },
    ]);
  });
});

describe("command validation", () => {
  it("requires commandId", () => {
    expect(
      ClientOrchestrationCommand.safeParse({ type: "thread.delete", threadId: "thread-1" }).success,
    ).toBe(false);
    expect(
      ClientOrchestrationCommand.safeParse({
        type: "thread.delete",
        threadId: "thread-1",
        commandId: "command-1",
      }).success,
    ).toBe(true);
  });
  it("rejects unknown commands and reversed turn ranges", () => {
    expect(
      ClientOrchestrationCommand.safeParse({
        type: "thread.future",
        commandId: "command-1",
        threadId: "thread-1",
      }).success,
    ).toBe(false);
    expect(
      OrchestrationGetTurnDiffInput.safeParse({
        threadId: "thread-1",
        fromTurnCount: 2,
        toTurnCount: 1,
      }).success,
    ).toBe(false);
  });
});

describe("pending requests", () => {
  const activity = (kind: string, payload: unknown) =>
    OrchestrationThreadActivity.parse({
      id: `activity-${kind}`,
      tone: "approval",
      kind,
      summary: "Example",
      payload,
      turnId: null,
      createdAt: "2026-01-01T00:00:00Z",
    });
  const request = (kind: string, requestId: string, extra = {}) =>
    activity(kind, {
      requestId,
      ...(kind.startsWith("user-input.requested") ? { questions: [] } : {}),
      ...(kind.startsWith("provider.") ? { detail: "Example" } : {}),
      ...extra,
    });
  it.each(["approval", "user-input"])("clears %s on resolution", (kind) => {
    const first = request(`${kind}.requested`, "request-1");
    const second = request(`${kind}.requested`, "request-2");
    const pending = openRequests([first, second, request(`${kind}.resolved`, "request-1")]);
    expect([...pending.values()]).toEqual([second]);
  });
  it.each([
    "stale pending approval request",
    "unknown pending approval request",
    "unknown pending permission request",
    "stale pending user-input request",
    "unknown pending user-input request",
    "unknown pending user input request",
    "unknown pending codex user input request",
  ])("clears stale failure: %s", (detail) => {
    for (const kind of ["approval", "user-input"]) {
      expect(
        openRequests([
          request(`${kind}.requested`, "request-1"),
          request(`provider.${kind}.respond.failed`, "request-1", { detail: detail.toUpperCase() }),
        ]).size,
      ).toBe(0);
    }
  });
  it("keeps transient failures and ignores malformed request ids", () => {
    const first = request("approval.requested", "request-1");
    const pending = openRequests([
      first,
      request("provider.approval.respond.failed", "request-1", {
        detail: "Connection unavailable",
      }),
      activity("approval.resolved", null),
      activity("approval.resolved", { requestId: 3 }),
    ]);
    expect([...pending.values()]).toEqual([first]);
  });
  it("uses the last request with the same id, in activity order", () => {
    const replacement = request("user-input.requested", "request-1", { questions: [] });
    expect([
      ...openRequests([request("approval.requested", "request-1"), replacement]).values(),
    ]).toEqual([replacement]);
  });
  it("decodes runtime question options and optional headers", () => {
    const result = UserInputRequestedPayload.parse({
      requestId: "request-1",
      questions: [
        { id: "choice", question: "Which color?", multiSelect: true, options: [{ label: "Blue" }] },
      ],
    });
    expect(result.questions[0]?.multiSelect).toBe(true);
    expect(result.questions[0]?.options[0]?.label).toBe("Blue");
  });
});

describe("nested contract validation", () => {
  it("keeps future provider statuses in config arrays", () => {
    const raw = fixture("server-config") as { providers: Array<Record<string, unknown>> };
    const provider = raw.providers[0];
    expect(provider).toBeDefined();
    const value = ServerConfig.parse({
      ...raw,
      providers: [{ ...provider, status: "future-status", auth: { status: "future-auth" } }],
    });
    expect(value.providers).toHaveLength(1);
    expect(value.providers[0]?.status).toBe("future-status");
  });
  it("rejects conflicting title changes and unknown input modes", () => {
    expect(
      ThreadMetaUpdateCommand.safeParse({
        type: "thread.meta.update",
        commandId: "command-1",
        threadId: "thread-1",
        title: "Example",
        regenerateTitle: true,
      }).success,
    ).toBe(false);
    expect(
      ClientOrchestrationCommand.safeParse({
        type: "thread.runtime-mode.set",
        commandId: "command-1",
        threadId: "thread-1",
        runtimeMode: "future-mode",
        createdAt: "2026-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
  });
  it("drops malformed context records but rejects duplicate context ids", () => {
    const record = {
      version: 1,
      contextId: "context-1",
      label: "Example",
      kind: "mention",
      path: "/tmp/example",
    };
    expect(
      OrchestrationMessageContext.parse({ version: 1, records: [{ kind: "mention" }, record] })
        .records,
    ).toEqual([record]);
    expect(
      OrchestrationMessageContext.safeParse({ version: 1, records: [record, record] }).success,
    ).toBe(false);
  });
  it("retains future context payloads with their reference ids", () => {
    const record = {
      version: 1,
      contextId: "context-1",
      label: "Example",
      kind: "future-context",
      payload: { key: true },
    };
    expect(OrchestrationMessageContext.parse({ version: 1, records: [record] }).records).toEqual([
      record,
    ]);
  });
  it("decodes recursive accessibility trees and rejects malformed nodes", () => {
    const node = { role: "button", bounds: null, children: [] };
    const tree = {
      format: "element-tree",
      coordinateSpace: "captured-image",
      imageSize: { width: 10, height: 10 },
      truncated: false,
      root: { ...node, children: [node] },
    };
    expect(SnapShotAccessibility.safeParse(tree).success).toBe(true);
    expect(SnapShotAccessibility.safeParse({ ...tree, root: { children: [] } }).success).toBe(
      false,
    );
    expect(
      SnapShotAccessibility.safeParse({ format: "flat-text", text: "", truncated: false }).success,
    ).toBe(false);
  });
  it("bounds monograms by graphemes", () => {
    expect(ProjectMonogramText.safeParse("AB").success).toBe(true);
    expect(ProjectMonogramText.safeParse("ABC").success).toBe(false);
    expect(ProjectMonogramText.safeParse("!").success).toBe(false);
  });
});
