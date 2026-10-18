// ---
// relationships:
//   implements: mcp
// ---
import { z } from "zod";
import { v5 as uuidv5 } from "uuid";
import {
  schemas,
  projectId as toProjectId,
  threadId,
  type ThreadLaunchInput,
} from "@wyrd-company/t3code-lib";
import { runtimeMode } from "../config/schema.ts";
import { boundedMode } from "../policy/policy.ts";
import { ToolError } from "../errors.ts";
import { requireThread } from "./selection.ts";
import { launchOnce } from "./idempotentLaunch.ts";
import { tool, serverArg, threadArgs } from "./spec.ts";
// Package namespace derived from the DNS namespace; JSON tuple avoids ambiguous concatenation.
export const launchNamespace = uuidv5("t3code-mcp", uuidv5.DNS);
export const launchThreadId = (server: string, request: string) =>
  threadId(uuidv5(JSON.stringify([server, request]), launchNamespace));
const modelSelection = z.object({
  instanceId: schemas.common.ProviderInstanceId,
  model: z.string().min(1),
  options: z
    .array(z.object({ id: z.string().min(1), value: z.union([z.string().min(1), z.boolean()]) }))
    .optional(),
});
export const dispatchTools = [
  tool(
    "thread_launch",
    "Create a thread on another server, optionally starting initialMessage. Supply exactly one of projectId, workspaceRoot or scratch:true, and an explicit modelSelection from server_capabilities. workspace selects root/existing_worktree/worktree. Retain clientRequestId and reuse it on retry for idempotent launch; then call thread_wait and thread_read.",
    false,
    {
      server: serverArg,
      projectId: z.string().min(1).optional(),
      workspaceRoot: z.string().min(1).optional(),
      scratch: z.boolean().optional(),
      title: z.string().min(1).default("New thread"),
      modelSelection,
      runtimeMode: runtimeMode.optional(),
      interactionMode: z.enum(["default", "plan"]).optional(),
      workspace: schemas.orchestrationRuns.OrchestrationV2ThreadLaunchWorkspaceStrategy.default({
        type: "root",
      }),
      initialMessage: z.string().min(1).optional(),
      clientRequestId: z.string().min(1).optional(),
    },
    async (args, { registry, signal }) => {
      if (
        Number(args.projectId !== undefined) +
          Number(args.workspaceRoot !== undefined) +
          Number(args.scratch === true) !==
        1
      )
        throw new ToolError(
          "invalid_input",
          "Supply exactly one of projectId, workspaceRoot or scratch:true.",
        );
      const server = registry.resolve(args.server);
      const mode = boundedMode(args.runtimeMode, registry.config.serverPolicies[server] ?? {});
      const client = await registry.client(server, "thread_launch");
      if (
        args.projectId !== undefined &&
        !(await client.projects.get(toProjectId(args.projectId), signal))
      )
        throw new ToolError("not_found", "Project does not exist.");
      const projectId =
        args.projectId ??
        (args.scratch
          ? (await client.projects.ensureScratch(signal)).projectId
          : (
              await client.projects.ensure(
                {
                  workspaceRoot: args.workspaceRoot!,
                  title: args.workspaceRoot!.split(/[\\/]/).findLast(Boolean) ?? "Project",
                },
                signal,
              )
            ).id);
      const input: ThreadLaunchInput = {
        projectId: toProjectId(projectId),
        title: args.title,
        modelSelection: args.modelSelection,
        workspace: args.workspace,
        creationSource: "mcp",
        ...(mode === undefined ? {} : { runtimeMode: mode }),
        ...(args.interactionMode === undefined ? {} : { interactionMode: args.interactionMode }),
        ...(args.initialMessage === undefined
          ? {}
          : { initialMessage: { text: args.initialMessage } }),
        ...(args.clientRequestId === undefined
          ? {}
          : { threadId: launchThreadId(server, args.clientRequestId), reuseExistingThread: false }),
      };
      return launchOnce(registry, server, client, input, signal);
    },
  ),
  tool(
    "thread_send",
    "Send text to an existing thread. mode:auto lets the server choose delivery; queue waits behind active work; steer/restart target the active run. runtimeMode is limited by server policy. Sends are not idempotent: after a lost response, read the thread before retrying. Follow with thread_wait.",
    false,
    {
      ...threadArgs,
      text: z.string().min(1),
      mode: z.enum(["auto", "queue", "steer", "restart"]).default("auto"),
      runtimeMode: runtimeMode.optional(),
      modelSelection: modelSelection.optional(),
    },
    async (args, { registry, signal }) => {
      const server = registry.resolve(args.server);
      const policy = registry.config.serverPolicies[server] ?? {};
      let mode = boundedMode(args.runtimeMode, policy);
      const client = await registry.client(server, "thread_send");
      const id = threadId(args.threadId);
      const current = await requireThread(client, args.threadId, signal);
      if (policy.maxRuntimeMode !== undefined && args.runtimeMode === undefined) {
        // A send with no mode uses the existing mode; refuse a thread above the cap.
        boundedMode(current.runtimeMode, policy);
        mode = undefined;
      }
      const turn = await client.threads.startTurn({
        threadId: id,
        text: args.text,
        delivery: args.mode,
        origin: { createdBy: "agent", creationSource: "mcp" },
        signal,
        ...(mode === undefined ? {} : { runtimeMode: mode }),
        ...(args.modelSelection === undefined ? {} : { modelSelection: args.modelSelection }),
      });
      return {
        server,
        threadId: id,
        messageId: turn.messageId,
        sequence: turn.sequence,
        mode: args.mode,
      };
    },
  ),
];
