// ---
// relationships:
//   implements: library
// ---
import { VoidSuccess, defineMethod } from "../spec.ts";
import {
  VcsCreateRefInput,
  VcsCreateRefResult,
  VcsCreateWorktreeInput,
  VcsCreateWorktreeResult,
  VcsInitInput,
  VcsListRefsInput,
  VcsListRefsResult,
  VcsPullInput,
  VcsPullResult,
  VcsRemoveWorktreeInput,
  VcsRefreshStatusInput,
  VcsBranchStatus,
  VcsStatusInput,
  VcsStatusSubscriptionInput,
  VcsStatusResult,
  VcsStatusStreamEvent,
  VcsSwitchRefInput,
  VcsSwitchRefResult,
} from "../../schemas/vcs.ts";
import {
  WorktreeSetupCancelInput,
  WorktreeSetupCancelResult,
  WorktreeSetupStreamEvent,
  WorktreeSetupSubscribeInput,
} from "../../schemas/worktreeSetup.ts";

export const vcsMethods = {
  "vcs.listRefs": defineMethod({
    payload: VcsListRefsInput,
    success: VcsListRefsResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "vcs.createWorktree": defineMethod({
    payload: VcsCreateWorktreeInput,
    success: VcsCreateWorktreeResult,
    stream: false,
    scope: "source-control:write",
  }),
  "vcs.createRef": defineMethod({
    payload: VcsCreateRefInput,
    success: VcsCreateRefResult,
    stream: false,
    scope: "source-control:write",
  }),
  "vcs.switchRef": defineMethod({
    payload: VcsSwitchRefInput,
    success: VcsSwitchRefResult,
    stream: false,
    scope: "source-control:write",
  }),
  "vcs.removeWorktree": defineMethod({
    payload: VcsRemoveWorktreeInput,
    success: VoidSuccess,
    stream: false,
    scope: "source-control:write",
  }),
  "vcs.pull": defineMethod({
    payload: VcsPullInput,
    success: VcsPullResult,
    stream: false,
    scope: "source-control:write",
  }),
  "vcs.init": defineMethod({
    payload: VcsInitInput,
    success: VoidSuccess,
    stream: false,
    scope: "source-control:write",
  }),
  "vcs.refreshStatus": defineMethod({
    payload: VcsRefreshStatusInput,
    success: VcsStatusResult,
    stream: false,
    scope: "orchestration:read",
  }),
  subscribeVcsStatus: defineMethod({
    payload: VcsStatusSubscriptionInput,
    success: VcsStatusStreamEvent,
    stream: true,
    scope: "orchestration:read",
  }),
  subscribeVcsBranch: defineMethod({
    payload: VcsStatusInput,
    success: VcsBranchStatus,
    stream: true,
    scope: "orchestration:read",
  }),
  "vcs.refreshBranch": defineMethod({
    payload: VcsStatusInput,
    success: VoidSuccess,
    stream: false,
    scope: "orchestration:read",
  }),
  subscribeWorktreeSetup: defineMethod({
    payload: WorktreeSetupSubscribeInput,
    success: WorktreeSetupStreamEvent,
    stream: true,
    scope: "orchestration:read",
  }),
  "worktreeSetup.cancel": defineMethod({
    payload: WorktreeSetupCancelInput,
    success: WorktreeSetupCancelResult,
    stream: false,
    scope: "orchestration:operate",
  }),
} as const;
