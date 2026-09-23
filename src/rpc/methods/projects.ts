// ---
// relationships:
//   implements: design
// ---
import { defineMethod } from "../spec.ts";
import {
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
  "projects.listEntries": defineMethod({
    payload: ProjectListEntriesInput,
    success: ProjectListEntriesResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "projects.readFile": defineMethod({
    payload: ProjectReadFileInput,
    success: ProjectReadFileResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "projects.writeFile": defineMethod({
    payload: ProjectWriteFileInput,
    success: ProjectWriteFileResult,
    stream: false,
    scope: "orchestration:operate",
  }),
  "projects.searchEntries": defineMethod({
    payload: ProjectSearchEntriesInput,
    success: ProjectSearchEntriesResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "projects.searchContents": defineMethod({
    payload: ProjectSearchContentsInput,
    success: ProjectSearchContentsResult,
    stream: false,
    scope: "orchestration:read",
  }),
} as const;
