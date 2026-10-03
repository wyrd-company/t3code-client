import { describe, expect, it } from "vite-plus/test";
import {
  ClientOrchestrationCommand,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  ThreadTurnStartBootstrap,
  UserInputAttachments,
} from "./commands.ts";
import { ProjectIconOverride } from "./model.ts";

const file = (index: number) => ({
  type: "file",
  id: `file-${index}`,
  name: `notes-${index}.txt`,
  mimeType: "text/plain",
  sizeBytes: 10,
});

describe("orchestration commands", () => {
  it("accepts up to 100 attachments per answered question", () => {
    expect(PROVIDER_SEND_TURN_MAX_ATTACHMENTS).toBe(100);
    const files = (count: number) => ({ q1: Array.from({ length: count }, (_, i) => file(i)) });
    expect(UserInputAttachments.safeParse(files(100)).success).toBe(true);
    expect(UserInputAttachments.safeParse(files(101)).success).toBe(false);
  });

  it("validates thread.auto-settle.set", () => {
    const command = {
      type: "thread.auto-settle.set",
      commandId: "command-1",
      threadId: "thread-1",
      enabled: false,
    };
    expect(ClientOrchestrationCommand.parse(command)).toEqual(command);
    expect(ClientOrchestrationCommand.safeParse({ ...command, enabled: "no" }).success).toBe(false);
  });

  it("carries requireWorktree on a prepared worktree", () => {
    const bootstrap = {
      prepareWorktree: { projectCwd: "/work/sample", baseBranch: "main", requireWorktree: true },
    };
    expect(ThreadTurnStartBootstrap.parse(bootstrap)).toEqual(bootstrap);
  });
});

describe("project icons", () => {
  it("decodes a Lucide icon with monogram text as a monogram", () => {
    const wire = { kind: "lucide", name: "folder-code", color: "blue", monogramText: "AB" };
    expect(ProjectIconOverride.parse(wire)).toEqual({
      kind: "monogram",
      text: "AB",
      color: "blue",
    });
    expect(ProjectIconOverride.parse({ ...wire, monogramText: undefined, monogram: "C" })).toEqual({
      kind: "monogram",
      text: "C",
      color: "blue",
    });
  });

  it("keeps a plain Lucide icon and accepts a monogram icon", () => {
    const lucide = { kind: "lucide", name: "folder-code", color: "blue" };
    expect(ProjectIconOverride.parse(lucide)).toEqual(lucide);
    const monogram = { kind: "monogram", text: "XY", color: "red" };
    expect(ProjectIconOverride.parse(monogram)).toEqual(monogram);
  });

  it("decodes an unfamiliar icon kind as unknown", () => {
    expect(ProjectIconOverride.parse({ kind: "glyph", glyph: "x" })).toMatchObject({
      unknown: true,
    });
  });
});
