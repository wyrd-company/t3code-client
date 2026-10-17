// ---
// relationships:
//   verifies: command-line
// ---
import { expect, it, vi } from "vite-plus/test";
import {
  T3Client,
  providerInstanceId,
  projectId,
  T3NotFoundError,
  T3PreconditionError,
  type OrchestrationProjectShell,
} from "@wyrd-company/t3code-lib";
import { selectModel, selectProject, validateDispatchOptions } from "./selection.ts";

type Provider = Awaited<ReturnType<T3Client["server"]["providers"]>>[number];
function provider(
  instanceId = "sample",
  models = [
    { slug: "standard", isDefault: true },
    { slug: "custom", isCustom: true, aliases: ["alias"] },
  ],
): Provider {
  return {
    instanceId: providerInstanceId(instanceId),
    enabled: true,
    installed: true,
    status: "ready",
    models,
  } as unknown as Provider;
}
it("selects project defaults then server defaults and advertised model defaults", () => {
  const catalog = [provider()];
  const project = {
    instanceId: providerInstanceId("sample"),
    model: "custom",
    options: [{ id: "effort", value: "low" }],
  };
  expect(selectModel(catalog, {}, project, { instanceId: "sample", model: "standard" })).toEqual(
    project,
  );
  expect(selectModel(catalog, {}, null, project)).toEqual(project);
  expect(selectModel(catalog, {}, null, undefined).model).toBe("standard");
  expect(selectModel(catalog, { provider: "sample" }, null, undefined).model).toBe("standard");
});
it("resolves custom models and aliases without a built-in model list", () => {
  expect(
    selectModel([provider()], { provider: "sample", model: "alias" }, null, undefined),
  ).toEqual({ instanceId: "sample", model: "custom" });
});
it("retains configured options when a default uses a model alias", () => {
  const fallback = {
    instanceId: providerInstanceId("sample"),
    model: "alias",
    options: [{ id: "effort", value: "low" }],
  };
  expect(selectModel([provider()], {}, fallback, null)).toEqual({ ...fallback, model: "custom" });
});
it("rejects ambiguous catalogs and never takes the first model", () => {
  expect(() => selectModel([provider(), provider("other")], {}, null, null)).toThrow(
    T3PreconditionError,
  );
  expect(() =>
    selectModel([provider("sample", [{ slug: "standard", isDefault: false }])], {}, null, null),
  ).toThrow(T3PreconditionError);
});
it.each([{ provider: "missing" }, { model: "missing" }, { provider: "sample", model: "missing" }])(
  "rejects missing selections %j",
  (options) => {
    expect(() => selectModel([provider()], options, null, null)).toThrow(T3NotFoundError);
  },
);
it.each([{ enabled: false }, { availability: "unavailable" }])(
  "rejects unavailable provider %j",
  (override) => {
    expect(() => selectModel([{ ...provider(), ...override }], {}, null, null)).toThrow(
      T3NotFoundError,
    );
  },
);
it.each([
  { status: "error" },
  { installed: false, availability: "available" },
  { status: "disabled" },
])("keeps selectable providers despite diagnostic fields: %j", (diagnostics) => {
  expect(selectModel([{ ...provider(), ...diagnostics }], {}, null, null)).toEqual({
    instanceId: "sample",
    model: "standard",
  });
});
it.each([
  { project: "p", projectPath: "/sample" },
  { baseRef: "main" },
  { thread: "t", worktree: true },
  { thread: "t", project: "p" },
  { thread: "t", projectPath: "/sample" },
  { thread: "t", baseRef: "main", worktree: true },
  { model: "" },
  { projectPath: " " },
  { title: " " },
  { mode: "" },
])("rejects invalid flags before resource calls: %j", (options) => {
  expect(() => validateDispatchOptions(options)).toThrow(T3PreconditionError);
});
it("selects project id, project path and Scratch through library facades", async () => {
  const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
  const project = {
    id: projectId("sample"),
    workspaceRoot: "/sample",
    defaultModelSelection: null,
  } as OrchestrationProjectShell;
  const get = vi.spyOn(client.projects, "get").mockResolvedValue(project);
  const ensure = vi.spyOn(client.projects, "ensure").mockResolvedValue(project);
  const scratch = vi
    .spyOn(client.projects, "ensureScratch")
    .mockResolvedValue({ projectId: project.id });
  try {
    expect(await selectProject(client, { project: "sample" })).toBe(project);
    expect(get).toHaveBeenLastCalledWith(project.id);
    expect(await selectProject(client, { projectPath: "/sample" })).toBe(project);
    expect(ensure).toHaveBeenCalledExactlyOnceWith({ workspaceRoot: "/sample", title: "sample" });
    expect(await selectProject(client, {})).toBe(project);
    expect(scratch).toHaveBeenCalledOnce();
    get.mockResolvedValue(undefined);
    await expect(selectProject(client, { project: "missing" })).rejects.toBeInstanceOf(
      T3NotFoundError,
    );
  } finally {
    await client.close();
  }
});
