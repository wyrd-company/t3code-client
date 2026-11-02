// ---
// relationships:
//   implements: library
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { rpcMethods, type RpcMethods, type RpcMethodName } from "./registry.ts";
import type { RpcPayload, RpcSuccess, StreamMethodName, UnaryMethodName } from "./spec.ts";
import { VcsStatusStreamEvent } from "../schemas/vcs.ts";
import { TerminalAttachStreamEvent } from "../schemas/terminal.ts";

const expected = {
  "orchestration.dispatchCommand": [false, "orchestration:operate"],
  "orchestration.launchThread": [false, "orchestration:operate"],
  "orchestration.getThreadProjection": [false, "orchestration:read"],
  "orchestration.getTurnItem": [false, "orchestration:read"],
  "orchestration.getWorkflowScript": [false, "orchestration:read"],
  "orchestration.stopWorkflow": [false, "orchestration:operate"],
  "orchestration.forceStopThread": [false, "orchestration:operate"],
  "orchestration.getTurnDiff": [false, "orchestration:read"],
  "orchestration.getFullThreadDiff": [false, "orchestration:read"],
  "orchestration.searchThreads": [false, "orchestration:read"],
  "orchestration.searchThread": [false, "orchestration:read"],
  "orchestration.searchThreadStream": [true, "orchestration:read"],
  "orchestration.getArchivedShellSnapshot": [false, "orchestration:read"],
  "orchestration.getThreadFamily": [false, "orchestration:read"],
  "orchestration.getWorktreeThreadIds": [false, "orchestration:read"],
  "orchestration.getOlderSettledThreads": [false, "orchestration:read"],
  "orchestration.subscribeShell": [true, "orchestration:read"],
  "orchestration.subscribeThread": [true, "orchestration:read"],
  "orchestration.subscribeCommandOutput": [true, "orchestration:read"],
  "server.probe": [false, "orchestration:read"],
  "server.getConfig": [false, "orchestration:read"],
  "server.refreshProviders": [false, "orchestration:read"],
  "server.getNpmRelease": [false, "orchestration:read"],
  "server.prepareTriage": [false, "orchestration:operate"],
  "server.getDatabaseStorage": [true, "orchestration:read"],
  "server.getUsageSummary": [false, "diagnostics:read"],
  subscribeServerConfig: [true, "orchestration:read"],
  subscribeServerLifecycle: [true, "orchestration:read"],
  subscribeAuthAccess: [true, "access:read"],
  "peerLinks.list": [false, "access:read"],
  "peerLinks.link": [false, "access:write"],
  "peerLinks.unlink": [false, "access:write"],
  "peerLinks.answerRequest": [false, "access:write"],
  "guestShare.create": [false, "access:write"],
  "vcs.listRefs": [false, "orchestration:read"],
  "vcs.refreshStatus": [false, "orchestration:read"],
  "vcs.createWorktree": [false, "source-control:write"],
  "vcs.removeWorktree": [false, "source-control:write"],
  "vcs.createRef": [false, "source-control:write"],
  "vcs.switchRef": [false, "source-control:write"],
  subscribeVcsStatus: [true, "orchestration:read"],
  subscribeWorktreeSetup: [true, "orchestration:read"],
  "worktreeSetup.cancel": [false, "orchestration:operate"],
  "projects.mutate": [false, "orchestration:operate"],
  "projects.listEntries": [false, "filesystem:read"],
  "projects.listIgnoredFiles": [false, "filesystem:read"],
  "projects.readFile": [false, "filesystem:read"],
  "projects.writeFile": [false, "filesystem:write"],
  "projects.searchEntries": [false, "filesystem:read"],
  "projects.searchContents": [false, "filesystem:read"],
  "projects.ensureScratch": [false, "orchestration:operate"],
  "projects.createNew": [false, "orchestration:operate"],
  "projects.createFromThread": [false, "orchestration:operate"],
  "terminal.open": [false, "terminal:operate"],
  "terminal.attach": [true, "terminal:operate"],
  "terminal.write": [false, "terminal:operate"],
  "terminal.resize": [false, "terminal:operate"],
  "terminal.close": [false, "terminal:operate"],
  "mcpApps.callTool": [false, "orchestration:operate"],
  "mcpApps.toolInfo": [false, "orchestration:read"],
  "mcpApps.readResource": [false, "orchestration:read"],
  "mcpApps.updateModelContext": [false, "orchestration:operate"],
  "scheduledTasks.subscribe": [true, "orchestration:read"],
  "scheduledTasks.upsert": [false, "orchestration:operate"],
  "scheduledTasks.setEnabled": [false, "orchestration:operate"],
  "scheduledTasks.delete": [false, "orchestration:operate"],
  "scheduledTasks.runNow": [false, "orchestration:operate"],
  "scheduledTasks.rotateWebhookToken": [false, "orchestration:operate"],
  "scheduledTasks.listWebhookDeliveries": [false, "orchestration:operate"],
  "scheduledTasks.getWebhookDelivery": [false, "orchestration:operate"],
  "filesystem.browse": [false, "filesystem:read"],
  "filesystem.getMetadata": [false, "filesystem:read"],
  "assets.createUrl": [false, "orchestration:read"],
  "assets.persistChatAttachments": [false, "orchestration:operate"],
  "attachments.createUploadUrl": [false, "orchestration:operate"],
  "attachments.delete": [false, "orchestration:operate"],
  "shell.openInEditor": [false, "orchestration:operate"],
} as const;

describe("RPC contract registry", () => {
  it("covers exactly the design's wire methods, with server scopes and stream flags", () => {
    expect(Object.keys(rpcMethods).sort()).toEqual(Object.keys(expected).sort());
    for (const name of Object.keys(expected) as RpcMethodName[]) {
      expect([rpcMethods[name].stream, rpcMethods[name].scope], name).toEqual(expected[name]);
    }
  });
  it("asks for settings:write only when a project mutation carries scripts", () => {
    const scopes = rpcMethods["projects.mutate"].payloadScopes;
    const update = { type: "project.update", commandId: "command-1", projectId: "project-1" };
    expect(scopes?.(rpcMethods["projects.mutate"].payload.parse(update))).toEqual([]);
    expect(
      scopes?.(rpcMethods["projects.mutate"].payload.parse({ ...update, scripts: [] })),
    ).toEqual(["settings:write"]);
  });
  it("asks for the file grant in place of the orchestration grant for an asset on disk", () => {
    const spec = rpcMethods["assets.createUrl"];
    const scopeOf = (resource: unknown) => spec.scopeForPayload?.(spec.payload.parse({ resource }));
    const threadId = "thread-1";
    for (const resource of [
      { _tag: "workspace-file", threadId, path: "a.png" },
      { _tag: "media-file", threadId, path: "a.png" },
      { _tag: "draft-workspace-file", cwd: "/sample", path: "a.png" },
    ]) {
      expect(scopeOf(resource), resource._tag).toBe("filesystem:read");
    }
    for (const resource of [
      { _tag: "attachment", attachmentId: "attachment-1" },
      { _tag: "tool-output-image", threadId, itemId: "item-1", index: 0 },
      { _tag: "project-favicon", cwd: "/sample" },
      { _tag: "native-app-icon", app: { _tag: "app-id", appId: "sample.app" } },
      { _tag: "github-media", cwd: "/sample", url: "https://host.invalid/a.png" },
    ]) {
      expect(scopeOf(resource), resource._tag).toBe("orchestration:read");
    }
  });
  it("retains payload, success, and stream types", () => {
    expectTypeOf<"terminal.attach">().toExtend<StreamMethodName<RpcMethods>>();
    expectTypeOf<"terminal.attach">().not.toExtend<UnaryMethodName<RpcMethods>>();
    expectTypeOf<
      RpcPayload<RpcMethods, "projects.readFile">["relativePath"]
    >().toEqualTypeOf<string>();
    expectTypeOf<
      RpcSuccess<RpcMethods, "orchestration.dispatchCommand">["sequence"]
    >().toEqualTypeOf<number>();
    expectTypeOf<
      RpcSuccess<RpcMethods, "orchestration.launchThread">["resumed"]
    >().toEqualTypeOf<boolean>();
    expectTypeOf<"orchestration.subscribeShell">().toExtend<StreamMethodName<RpcMethods>>();
  });
  it("validates orchestration read inputs before sending", () => {
    expect(
      rpcMethods["orchestration.getTurnItem"].payload.parse({
        threadId: "thread-1",
        itemId: "item-1",
        revision: "2020-01-01T00:00:00.000Z",
      }),
    ).toEqual({ threadId: "thread-1", itemId: "item-1", revision: "2020-01-01T00:00:00.000Z" });
    expect(
      rpcMethods["orchestration.getTurnItem"].payload.safeParse({ threadId: "thread-1" }).success,
    ).toBe(false);
    expect(
      rpcMethods["orchestration.subscribeThread"].payload.parse({
        threadId: "thread-1",
        afterSequence: 3,
        requestCompletionMarker: true,
        acceptBoundedSnapshot: true,
      }),
    ).toMatchObject({ afterSequence: 3, acceptBoundedSnapshot: true });
    expect(
      rpcMethods["orchestration.subscribeShell"].payload.safeParse({ afterSequence: -1 }).success,
    ).toBe(false);
    expect(rpcMethods["orchestration.getArchivedShellSnapshot"].payload.parse({})).toEqual({});
  });
  it("validates optional server subscription and refresh flags", () => {
    const schema = rpcMethods.subscribeServerConfig.payload;
    expect(schema.parse({})).toEqual({});
    expect(
      schema.parse({
        environmentThemes: true,
        usageLimitSources: true,
        usageLimitsCommand: false,
        workspaceSnapshotsOnDemand: true,
      }),
    ).toEqual({
      environmentThemes: true,
      usageLimitSources: true,
      usageLimitsCommand: false,
      workspaceSnapshotsOnDemand: true,
    });
    expect(schema.safeParse({ usageLimitsCommand: "yes" }).success).toBe(false);
    expect(schema.safeParse({ workspaceSnapshotsOnDemand: "yes" }).success).toBe(false);
    expect(
      rpcMethods["server.refreshProviders"].payload.safeParse({
        instanceId: "example",
        cwd: "/tmp/example",
        fresh: true,
        refreshModels: true,
        reloadSecrets: true,
        workspaceSnapshotsOnDemand: true,
        usageLimitsCommand: true,
      }).success,
    ).toBe(true);
    for (const flag of ["reloadSecrets", "workspaceSnapshotsOnDemand", "usageLimitsCommand"]) {
      expect(rpcMethods["server.refreshProviders"].payload.safeParse({ [flag]: 1 }).success).toBe(
        false,
      );
    }
    expect(rpcMethods["server.refreshProviders"].payload.safeParse({ fresh: "yes" }).success).toBe(
      false,
    );
  });
  it("models omitted unary success values as void", () => {
    for (const name of [
      "terminal.write",
      "terminal.resize",
      "terminal.close",
      "vcs.removeWorktree",
    ] as const) {
      expect(rpcMethods[name].success.safeParse(undefined).success).toBe(true);
      expect(rpcMethods[name].success.safeParse({}).success).toBe(false);
    }
  });
  it("uses the server's _tag discriminator for VCS streams", () => {
    expect(VcsStatusStreamEvent.parse({ _tag: "remoteUpdated", remote: null })).toEqual({
      _tag: "remoteUpdated",
      remote: null,
    });
    expect(VcsStatusStreamEvent.parse({ _tag: "future", data: 1 })).toEqual({
      unknown: true,
      raw: { _tag: "future", data: 1 },
    });
    expect(VcsStatusStreamEvent.safeParse({ _tag: "localUpdated", local: {} }).success).toBe(false);
  });
  it("decodes terminal attach updates and unfamiliar events", () => {
    expect(
      TerminalAttachStreamEvent.parse({
        type: "output",
        threadId: "thread-1",
        terminalId: "term-1",
        data: "output",
        sequence: 1,
      }),
    ).toMatchObject({ type: "output", data: "output" });
    expect(TerminalAttachStreamEvent.parse({ type: "future" })).toEqual({
      unknown: true,
      raw: { type: "future" },
    });
  });
  it("requires explicit terminal identifiers and valid sizes", () => {
    expect(
      rpcMethods["terminal.open"].payload.safeParse({ threadId: "thread-1", cwd: "/tmp/example" })
        .success,
    ).toBe(false);
    expect(
      rpcMethods["terminal.resize"].payload.safeParse({
        threadId: "thread-1",
        terminalId: "term-1",
        cols: 0,
        rows: 24,
      }).success,
    ).toBe(false);
    expect(rpcMethods["terminal.close"].payload.parse({ threadId: "thread-1" })).toEqual({
      threadId: "thread-1",
    });
  });
});
