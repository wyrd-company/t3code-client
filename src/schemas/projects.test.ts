import { describe, expect, it } from "vite-plus/test";
import { Project, ProjectIconOverride, ProjectMutation, ReceivedProjectIcon } from "./projects.ts";

const at = "2020-01-01T00:00:00.000Z";

describe("ReceivedProjectIcon", () => {
  it("decodes a Lucide icon with monogram text as a monogram", () => {
    const wire = { kind: "lucide", name: "folder-code", color: "blue", monogramText: "AB" };
    expect(ReceivedProjectIcon.parse(wire)).toEqual({
      kind: "monogram",
      text: "AB",
      color: "blue",
    });
    expect(ReceivedProjectIcon.parse({ ...wire, monogramText: undefined, monogram: "C" })).toEqual({
      kind: "monogram",
      text: "C",
      color: "blue",
    });
  });
  it("keeps a plain Lucide icon, an emoji, and a monogram", () => {
    const lucide = { kind: "lucide", name: "folder-code", color: "blue" };
    expect(ReceivedProjectIcon.parse(lucide)).toEqual(lucide);
    const emoji = { kind: "emoji", emoji: "🙂" };
    expect(ReceivedProjectIcon.parse(emoji)).toEqual(emoji);
    const monogram = { kind: "monogram", text: "XY", color: "red" };
    expect(ReceivedProjectIcon.parse(monogram)).toEqual(monogram);
  });
  it("decodes an unknown kind as null and fails a malformed known kind", () => {
    expect(ReceivedProjectIcon.parse({ kind: "glyph", glyph: "x" })).toBeNull();
    expect(
      ReceivedProjectIcon.safeParse({ kind: "lucide", name: "Folder Code", color: "blue" }).success,
    ).toBe(false);
    expect(ReceivedProjectIcon.safeParse({ kind: "monogram", text: "XY" }).success).toBe(false);
  });
  it("is the override clients send, which stays strict", () => {
    expect(ProjectIconOverride.safeParse({ kind: "glyph" }).success).toBe(false);
    expect(
      ProjectIconOverride.safeParse({ kind: "monogram", text: "XY", color: "red" }).success,
    ).toBe(true);
  });
  it("decodes on a project record, including null", () => {
    const base = {
      id: "project-1",
      title: "Sample project",
      workspaceRoot: "/srv/sample",
      defaultModelSelection: null,
      scripts: [],
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    };
    expect(Project.parse({ ...base, projectIcon: null }).projectIcon).toBeNull();
    expect(Project.parse({ ...base, projectIcon: { kind: "future" } }).projectIcon).toBeNull();
    expect(Project.parse(base).projectIcon).toBeUndefined();
  });
});

describe("ProjectMutation", () => {
  const stamp = { commandId: "command-1", projectId: "project-1" };
  it("accepts create, update, and delete", () => {
    const create = {
      type: "project.create",
      ...stamp,
      title: "Sample",
      workspaceRoot: "/srv/sample",
    };
    expect(ProjectMutation.parse(create)).toEqual(create);
    const update = {
      type: "project.update",
      ...stamp,
      title: "Renamed",
      projectIcon: { kind: "monogram", text: "SP", color: "teal" },
      defaultModelSelection: { instanceId: "sample-provider", model: "sample-model" },
      scripts: [
        { id: "s1", name: "Test", command: "run test", icon: "test", runOnWorktreeCreate: false },
      ],
    };
    expect(ProjectMutation.parse(update)).toEqual(update);
    const remove = { type: "project.delete", ...stamp, force: true };
    expect(ProjectMutation.parse(remove)).toEqual(remove);
  });
  it("rejects an unknown type, a missing stamp, and a malformed payload", () => {
    expect(ProjectMutation.safeParse({ type: "project.archive", ...stamp }).success).toBe(false);
    expect(
      ProjectMutation.safeParse({ type: "project.delete", projectId: "project-1" }).success,
    ).toBe(false);
    expect(
      ProjectMutation.safeParse({ type: "project.create", ...stamp, title: "Sample" }).success,
    ).toBe(false);
    expect(
      ProjectMutation.safeParse({
        type: "project.update",
        ...stamp,
        projectIcon: { kind: "glyph" },
      }).success,
    ).toBe(false);
  });
});
