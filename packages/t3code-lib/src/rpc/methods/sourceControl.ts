// ---
// relationships:
//   implements: library
// ---
import { VoidSuccess, defineMethod } from "../spec.ts";
import { z } from "zod";
import {
  ProjectCloneActionInput,
  ProjectCloneActionResult,
  ProjectCloneListEvent,
  ProjectCloneStartInput,
  ProjectCloneStartResult,
} from "../../schemas/projectClone.ts";
import {
  SourceControlAppAccess,
  SourceControlCloneRepositoryInput,
  SourceControlCloneRepositoryResult,
  SourceControlPublishRepositoryInput,
  SourceControlPublishRepositoryResult,
  SourceControlRepositoryAccessInput,
  SourceControlRepositoryInfo,
  SourceControlRepositoryLookupInput,
  SourceControlSignInInput,
  SourceControlSignInPrompt,
  SourceControlSignInResult,
} from "../../schemas/sourceControl.ts";

export const sourceControlMethods = {
  "sourceControl.lookupRepository": defineMethod({
    payload: SourceControlRepositoryLookupInput,
    success: SourceControlRepositoryInfo,
    stream: false,
    scope: "orchestration:read",
  }),
  /** Waits for the clone. `projectClone.start` reports progress and can cancel. */
  "sourceControl.cloneRepository": defineMethod({
    payload: SourceControlCloneRepositoryInput,
    success: SourceControlCloneRepositoryResult,
    stream: false,
    scope: "source-control:write",
  }),
  /** Creates the repository on the forge, adds it as a remote and pushes the current branch. */
  "sourceControl.publishRepository": defineMethod({
    payload: SourceControlPublishRepositoryInput,
    success: SourceControlPublishRepositoryResult,
    stream: false,
    scope: "source-control:write",
  }),
  /** Starts a device-flow sign-in that replaces the server's credential for the forge. */
  "sourceControl.signInStart": defineMethod({
    payload: SourceControlSignInInput,
    success: SourceControlSignInPrompt,
    stream: false,
    scope: "settings:write",
  }),
  /** Resolves when the sign-in ends, however long the user takes. */
  "sourceControl.signInWait": defineMethod({
    payload: SourceControlSignInInput,
    success: SourceControlSignInResult,
    stream: false,
    scope: "settings:write",
  }),
  /** After this, approving the code signs nothing in. */
  "sourceControl.signInCancel": defineMethod({
    payload: SourceControlSignInInput,
    success: VoidSuccess,
    stream: false,
    scope: "settings:write",
  }),
  "sourceControl.appAccess": defineMethod({
    payload: SourceControlRepositoryAccessInput,
    success: SourceControlAppAccess,
    stream: false,
    scope: "orchestration:read",
  }),
  /** `false` when the server's forge account has not starred it, or the forge cannot say. */
  "sourceControl.starred": defineMethod({
    payload: SourceControlRepositoryAccessInput,
    success: z.boolean(),
    stream: false,
    scope: "orchestration:read",
  }),
  /** Returns when the project exists and the clone starts. `subscribeProjectClones` reports it. */
  "projectClone.start": defineMethod({
    payload: ProjectCloneStartInput,
    success: ProjectCloneStartResult,
    stream: false,
    scope: "source-control:write",
  }),
  "projectClone.cancel": defineMethod({
    payload: ProjectCloneActionInput,
    success: ProjectCloneActionResult,
    stream: false,
    scope: "source-control:write",
  }),
  /** Removes the partial clone and starts again. Applies to a failed or cancelled clone. */
  "projectClone.retry": defineMethod({
    payload: ProjectCloneActionInput,
    success: ProjectCloneActionResult,
    stream: false,
    scope: "source-control:write",
  }),
  subscribeProjectClones: defineMethod({
    payload: z.looseObject({}),
    success: ProjectCloneListEvent,
    stream: true,
    scope: "orchestration:read",
  }),
};
