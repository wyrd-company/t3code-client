// ---
// relationships:
//   implements: design
// ---
import { z } from "zod";
import { defineMethod } from "../spec.ts";
import {
  Project,
  ProjectMutation,
  ProjectCreateNewInput,
  ProjectCreateNewResult,
  ProjectEnsureScratchResult,
  ProjectListEntriesInput,
  ProjectListEntriesResult,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectSearchContentsInput,
  ProjectSearchContentsResult,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "../../schemas/projects.ts";

export const projectsMethods = {
  "projects.mutate": defineMethod({
    payload: ProjectMutation,
    success: Project,
    stream: false,
    scope: "orchestration:operate",
  }),
  "projects.listEntries": defineMethod({
    payload: ProjectListEntriesInput,
    success: ProjectListEntriesResult,
    stream: false,
    scope: "filesystem:read",
  }),
  "projects.readFile": defineMethod({
    payload: ProjectReadFileInput,
    success: ProjectReadFileResult,
    stream: false,
    scope: "filesystem:read",
  }),
  "projects.writeFile": defineMethod({
    payload: ProjectWriteFileInput,
    success: ProjectWriteFileResult,
    stream: false,
    scope: "filesystem:write",
  }),
  "projects.searchEntries": defineMethod({
    payload: ProjectSearchEntriesInput,
    success: ProjectSearchEntriesResult,
    stream: false,
    scope: "filesystem:read",
  }),
  "projects.searchContents": defineMethod({
    payload: ProjectSearchContentsInput,
    success: ProjectSearchContentsResult,
    stream: false,
    scope: "filesystem:read",
  }),
  "projects.ensureScratch": defineMethod({
    payload: z.looseObject({}),
    success: ProjectEnsureScratchResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "projects.createNew": defineMethod({
    payload: ProjectCreateNewInput,
    success: ProjectCreateNewResult,
    stream: false,
    scope: "orchestration:operate",
  }),
} as const;
