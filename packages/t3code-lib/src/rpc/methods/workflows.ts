// ---
// relationships:
//   implements: library
// ---
import {
  WorkflowAnswerInput,
  WorkflowCounts,
  WorkflowDefinitionChangeResult,
  WorkflowDefinitionDeleteInput,
  WorkflowDefinitionFiles,
  WorkflowDefinitionGetInput,
  WorkflowDefinitionSaveInput,
  WorkflowRunCancelInput,
  WorkflowRunDetail,
  WorkflowRunGetInput,
  WorkflowRunResumeInput,
  WorkflowRunsAbout,
  WorkflowRunsAboutInput,
  WorkflowRunsSubscribeInput,
  WorkflowRunsUpdate,
} from "../../schemas/workflow.ts";
import { VoidSuccess, defineMethod } from "../spec.ts";

// Readers see runs and questions. An answer, a resume and a cancel decide what a run's agents do
// next. The server runs a definition file, so saving or deleting one is running code there, as a
// terminal does, and reading the files reads the host's disk.
export const workflowsMethods = {
  "workflows.subscribe": defineMethod({
    payload: WorkflowRunsSubscribeInput,
    success: WorkflowRunsUpdate,
    stream: true,
    scope: "orchestration:read",
  }),
  "workflows.counts": defineMethod({
    payload: WorkflowRunsSubscribeInput,
    success: WorkflowCounts,
    stream: true,
    scope: "orchestration:read",
  }),
  "workflows.get": defineMethod({
    payload: WorkflowRunGetInput,
    success: WorkflowRunDetail,
    stream: false,
    scope: "orchestration:read",
  }),
  "workflows.about": defineMethod({
    payload: WorkflowRunsAboutInput,
    success: WorkflowRunsAbout,
    stream: false,
    scope: "orchestration:read",
  }),
  "workflows.answer": defineMethod({
    payload: WorkflowAnswerInput,
    success: VoidSuccess,
    stream: false,
    scope: "orchestration:operate",
  }),
  "workflows.resume": defineMethod({
    payload: WorkflowRunResumeInput,
    success: VoidSuccess,
    stream: false,
    scope: "orchestration:operate",
  }),
  "workflows.cancel": defineMethod({
    payload: WorkflowRunCancelInput,
    success: VoidSuccess,
    stream: false,
    scope: "orchestration:operate",
  }),
  "workflows.getDefinition": defineMethod({
    payload: WorkflowDefinitionGetInput,
    success: WorkflowDefinitionFiles,
    stream: false,
    scope: "filesystem:read",
  }),
  "workflows.saveDefinition": defineMethod({
    payload: WorkflowDefinitionSaveInput,
    success: WorkflowDefinitionChangeResult,
    stream: false,
    scope: "terminal:operate",
  }),
  "workflows.deleteDefinition": defineMethod({
    payload: WorkflowDefinitionDeleteInput,
    success: WorkflowDefinitionChangeResult,
    stream: false,
    scope: "terminal:operate",
  }),
} as const;
