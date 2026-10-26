// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { defineMethod } from "../spec.ts";
import {
  OrchestrationV2CommandOutputFrame,
  OrchestrationV2SubscribeCommandOutputInput,
} from "../../schemas/orchestration/commandOutput.ts";
import { OrchestrationV2Command } from "../../schemas/orchestration/commands.ts";
import { OrchestrationV2ThreadProjection } from "../../schemas/orchestration/projection.ts";
import {
  OrchestrationV2ArchivedShellSnapshot,
  OrchestrationV2ArchivedShellStreamItem,
  OrchestrationV2ShellStreamItem,
  OrchestrationV2SubscribeShellInput,
} from "../../schemas/orchestration/shell.ts";
import {
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetFullThreadDiffResult,
  OrchestrationGetTurnDiffInput,
  OrchestrationGetTurnDiffResult,
  OrchestrationGetWorkflowScriptInput,
  OrchestrationGetWorkflowScriptResult,
  OrchestrationSearchThreadsInput,
  OrchestrationSearchThreadsResult,
  OrchestrationV2DispatchCommandResult,
  OrchestrationV2GetThreadProjectionInput,
  OrchestrationV2GetTurnItemInput,
  OrchestrationV2GetTurnItemResult,
  OrchestrationV2StopWorkflowInput,
  OrchestrationV2SubscribeThreadInput,
  OrchestrationV2ThreadLaunchInput,
  OrchestrationV2ThreadLaunchResult,
  OrchestrationV2ThreadStreamItem,
} from "../../schemas/orchestration/stream.ts";
import {
  OrchestrationV2SearchThreadInput,
  OrchestrationV2SearchThreadResult,
} from "../../schemas/orchestration/threadFind.ts";

const read = "orchestration:read";
const operate = "orchestration:operate";

export const orchestrationMethods = {
  "orchestration.dispatchCommand": defineMethod({
    payload: OrchestrationV2Command,
    success: OrchestrationV2DispatchCommandResult,
    stream: false,
    scope: operate,
  }),
  "orchestration.launchThread": defineMethod({
    payload: OrchestrationV2ThreadLaunchInput,
    success: OrchestrationV2ThreadLaunchResult,
    stream: false,
    scope: operate,
  }),
  "orchestration.getThreadProjection": defineMethod({
    payload: OrchestrationV2GetThreadProjectionInput,
    success: OrchestrationV2ThreadProjection,
    stream: false,
    scope: read,
  }),
  "orchestration.getTurnItem": defineMethod({
    payload: OrchestrationV2GetTurnItemInput,
    success: OrchestrationV2GetTurnItemResult,
    stream: false,
    scope: read,
  }),
  "orchestration.getWorkflowScript": defineMethod({
    payload: OrchestrationGetWorkflowScriptInput,
    success: OrchestrationGetWorkflowScriptResult,
    stream: false,
    scope: read,
  }),
  "orchestration.stopWorkflow": defineMethod({
    payload: OrchestrationV2StopWorkflowInput,
    // Effect's JSON codec encodes Schema.Void as null; callers still receive void.
    success: z
      .null()
      .or(z.void())
      .transform((): void => undefined),
    stream: false,
    scope: operate,
  }),
  "orchestration.getTurnDiff": defineMethod({
    payload: OrchestrationGetTurnDiffInput,
    success: OrchestrationGetTurnDiffResult,
    stream: false,
    scope: read,
  }),
  "orchestration.getFullThreadDiff": defineMethod({
    payload: OrchestrationGetFullThreadDiffInput,
    success: OrchestrationGetFullThreadDiffResult,
    stream: false,
    scope: read,
  }),
  "orchestration.searchThreads": defineMethod({
    payload: OrchestrationSearchThreadsInput,
    success: OrchestrationSearchThreadsResult,
    stream: false,
    scope: read,
  }),
  "orchestration.searchThread": defineMethod({
    payload: OrchestrationV2SearchThreadInput,
    success: OrchestrationV2SearchThreadResult,
    stream: false,
    scope: read,
  }),
  /** Streams progressively better results; the last one has `complete: true`. */
  "orchestration.searchThreadStream": defineMethod({
    payload: OrchestrationV2SearchThreadInput,
    success: OrchestrationV2SearchThreadResult,
    stream: true,
    scope: read,
  }),
  "orchestration.getArchivedShellSnapshot": defineMethod({
    payload: z.looseObject({}),
    success: OrchestrationV2ArchivedShellSnapshot,
    stream: false,
    scope: read,
  }),
  "orchestration.subscribeArchivedShell": defineMethod({
    payload: z.looseObject({}),
    success: OrchestrationV2ArchivedShellStreamItem,
    stream: true,
    scope: read,
  }),
  "orchestration.subscribeShell": defineMethod({
    payload: OrchestrationV2SubscribeShellInput,
    success: OrchestrationV2ShellStreamItem,
    stream: true,
    scope: read,
  }),
  "orchestration.subscribeThread": defineMethod({
    payload: OrchestrationV2SubscribeThreadInput,
    success: OrchestrationV2ThreadStreamItem,
    stream: true,
    scope: read,
  }),
  /** One command row's output; the stream ends after a frame with `running: false`. */
  "orchestration.subscribeCommandOutput": defineMethod({
    payload: OrchestrationV2SubscribeCommandOutputInput,
    success: OrchestrationV2CommandOutputFrame,
    stream: true,
    scope: read,
  }),
} as const;
