import { describe, expect, it } from "vite-plus/test";
import { RpcErrorRecord, decodeRpcErrorRecord, isRpcErrorOfTag } from "./rpcErrors.ts";

describe("RpcErrorRecord", () => {
  it("decodes a known error with its fields", () => {
    const record = decodeRpcErrorRecord({
      _tag: "EnvironmentAuthorizationError",
      message: "Missing scope.",
      requiredScope: "terminal:operate",
      requiredPermission: "terminal:read",
    });
    expect(isRpcErrorOfTag(record, "EnvironmentAuthorizationError")).toBe(true);
    if (!isRpcErrorOfTag(record, "EnvironmentAuthorizationError")) return;
    expect(record.requiredScope).toBe("terminal:operate");
    expect(record.requiredPermission).toBe("terminal:read");
  });

  it("uses the wire tag of the keybindings error", () => {
    const record = decodeRpcErrorRecord({
      _tag: "KeybindingsConfigParseError",
      configPath: "/config/keybindings.json",
      detail: "Unexpected token.",
      cause: { name: "SyntaxError", message: "Unexpected token." },
    });
    expect(isRpcErrorOfTag(record, "KeybindingsConfigParseError")).toBe(true);
  });

  it("decodes the orchestration dispatch and launch failures", () => {
    const dispatch = decodeRpcErrorRecord({
      _tag: "OrchestrationV2DispatchCommandError",
      commandId: "command-1",
      commandType: "message.dispatch",
      message: "Dispatch failed.",
      detail: "The thread is archived.",
    });
    expect(isRpcErrorOfTag(dispatch, "OrchestrationV2DispatchCommandError")).toBe(true);
    if (isRpcErrorOfTag(dispatch, "OrchestrationV2DispatchCommandError")) {
      expect(dispatch.commandType).toBe("message.dispatch");
      expect(dispatch.detail).toBe("The thread is archived.");
    }
    const launch = decodeRpcErrorRecord({
      _tag: "OrchestrationV2ThreadLaunchError",
      commandId: "command-1",
      projectId: "project-1",
      message: "Launch failed.",
    });
    expect(isRpcErrorOfTag(launch, "OrchestrationV2ThreadLaunchError")).toBe(true);
    if (isRpcErrorOfTag(launch, "OrchestrationV2ThreadLaunchError")) {
      expect(launch.projectId).toBe("project-1");
    }
  });

  it("decodes the workflow stop and MCP app failures with their reasons", () => {
    const stop = decodeRpcErrorRecord({
      _tag: "OrchestrationV2StopWorkflowError",
      threadId: "thread-1",
      subagentId: "node-1",
      reason: "not-running",
    });
    expect(isRpcErrorOfTag(stop, "OrchestrationV2StopWorkflowError") && stop.reason).toBe(
      "not-running",
    );
    const app = decodeRpcErrorRecord({
      _tag: "McpAppRequestError",
      threadId: "thread-1",
      reason: "a-future-reason",
    });
    expect(isRpcErrorOfTag(app, "McpAppRequestError") && app.reason).toBe("a-future-reason");
  });

  it("decodes the projection, shell snapshot, and project mutation failures", () => {
    const projection = decodeRpcErrorRecord({
      _tag: "OrchestrationV2GetThreadProjectionError",
      threadId: "thread-1",
      message: "No such thread.",
    });
    expect(isRpcErrorOfTag(projection, "OrchestrationV2GetThreadProjectionError")).toBe(true);
    if (isRpcErrorOfTag(projection, "OrchestrationV2GetThreadProjectionError")) {
      expect(projection.threadId).toBe("thread-1");
    }
    const shell = decodeRpcErrorRecord({
      _tag: "OrchestrationV2GetShellSnapshotError",
      message: "Snapshot failed.",
      cause: { name: "Error" },
    });
    expect(isRpcErrorOfTag(shell, "OrchestrationV2GetShellSnapshotError")).toBe(true);
    const mutation = decodeRpcErrorRecord({
      _tag: "ProjectMutationError",
      commandId: "command-1",
      message: "Mutation failed.",
    });
    expect(isRpcErrorOfTag(mutation, "ProjectMutationError")).toBe(true);
    if (isRpcErrorOfTag(mutation, "ProjectMutationError"))
      expect(mutation.commandId).toBe("command-1");
  });

  it("decodes an unknown tag as the unknown variant", () => {
    const raw = { _tag: "SomeFutureError", reason: "later" };
    expect(decodeRpcErrorRecord(raw)).toEqual({ unknown: true, raw });
  });

  it("keeps a malformed known tag as raw instead of failing", () => {
    for (const raw of [
      { _tag: "TerminalWriteError", threadId: "thread-1" },
      { _tag: "OrchestrationV2DispatchCommandError", message: "Dispatch failed." },
      {
        _tag: "OrchestrationV2ThreadLaunchError",
        commandId: "command-1",
        message: "Launch failed.",
      },
      { _tag: "OrchestrationV2GetThreadProjectionError", message: "No such thread." },
      { _tag: "OrchestrationV2GetShellSnapshotError" },
      { _tag: "ProjectMutationError", message: "Mutation failed." },
    ]) {
      expect(RpcErrorRecord.safeParse(raw).success, raw._tag).toBe(false);
      expect(decodeRpcErrorRecord(raw)).toEqual({ unknown: true, raw });
    }
  });
});
