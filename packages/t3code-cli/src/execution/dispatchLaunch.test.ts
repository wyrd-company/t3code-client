// ---
// relationships:
//   verifies: command-line
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  T3NotFoundError,
  T3PreconditionError,
  providerInstanceId,
  type ModelSelection,
} from "@wyrd-company/t3code-lib";
import { closeDispatchClients, setup } from "../../test/dispatchSetup.ts";
import { dispatchPrompt } from "./dispatch.ts";
import type { DispatchOptions } from "./selection.ts";

afterEach(closeDispatchClients);
const descriptors = [
  { id: "flag", label: "Flag", type: "boolean" },
  {
    id: "level",
    label: "Level",
    type: "select",
    options: [
      { id: "low", label: "Low" },
      { id: "high", label: "High" },
    ],
  },
];
type Fixture = ReturnType<typeof setup>;
function withOptions(f: Fixture, inherited?: ModelSelection["options"]) {
  f.config.mockResolvedValue({
    settings: {},
    providers: [
      {
        instanceId: "sample-provider",
        enabled: true,
        installed: true,
        status: "ready",
        models: [
          { slug: "sample-model", capabilities: { optionDescriptors: descriptors } },
          {
            slug: "custom-model",
            isCustom: true,
            capabilities: { optionDescriptors: descriptors },
          },
        ],
      },
    ],
  } as unknown as Awaited<ReturnType<Fixture["client"]["server"]["getConfig"]>>);
  const selection = {
    instanceId: providerInstanceId("sample-provider"),
    model: "sample-model",
    ...(inherited === undefined ? {} : { options: inherited }),
  };
  f.project.defaultModelSelection = selection;
  f.existing.modelSelection = selection;
}
function launched(f: Fixture) {
  f.launch.mockResolvedValue({
    threadId: f.existing.id,
    projection: { messages: [{ id: "m", role: "user", runId: "launched-run" }], runs: [] },
  } as unknown as Awaited<ReturnType<Fixture["client"]["threads"]["launch"]>>);
}
function refs(f: Fixture, pages: { worktreePath: string | null; name: string }[][]) {
  return vi.spyOn(f.client.vcs, "listRefs").mockImplementation(async (input) => {
    const index = input.cursor ?? 0;
    const page = pages[index] ?? [];
    return {
      refs: page.map((ref) => ({ ...ref, current: false, isDefault: false })),
      isRepo: true,
      hasPrimaryRemote: false,
      nextCursor: index + 1 < pages.length ? index + 1 : null,
      totalCount: pages.flat().length,
    };
  });
}

it.each([
  [{}, { type: "worktree", baseRef: "HEAD" }],
  [{ startFromOrigin: false }, { type: "worktree", baseRef: "HEAD", startFromOrigin: false }],
  [{ startFromOrigin: true }, { type: "worktree", baseRef: "HEAD", startFromOrigin: true }],
  [
    { branch: "sample-branch", baseRef: "sample-base" },
    { type: "worktree", baseRef: "sample-base", branch: "sample-branch" },
  ],
] as const)("new worktree sends %j as exactly %j", async (extra, workspace) => {
  const f = setup();
  launched(f);
  await dispatchPrompt(f.invocation, "prompt", { worktree: true, ...extra });
  expect(f.launch.mock.calls[0]![0].workspace).toStrictEqual(workspace);
});
it("binds an advertised existing worktree by the server path and its branch", async () => {
  const f = setup();
  launched(f);
  const list = refs(f, [
    [{ worktreePath: null, name: "main" }],
    [
      { worktreePath: "/other/worktree", name: "other-branch" },
      { worktreePath: "/managed/sample-worktree", name: "sample-branch" },
    ],
  ]);
  const target = await dispatchPrompt(f.invocation, "prompt", {
    existingWorktree: "/managed/sample-worktree/",
  });
  expect(f.launch.mock.calls[0]![0]).toMatchObject({
    workspace: {
      type: "existing_worktree",
      worktreePath: "/managed/sample-worktree",
      branch: "sample-branch",
    },
    initialMessage: { text: "prompt" },
  });
  expect(target.runId).toBe("launched-run");
  expect(list.mock.calls.map(([input]) => input)).toEqual([
    { cwd: "/sample", refKind: "local", limit: 200 },
    { cwd: "/sample", refKind: "local", limit: 200, cursor: 1 },
  ]);
  expect(f.create).not.toHaveBeenCalled();
});
it("rejects an unadvertised existing worktree before any thread mutation", async () => {
  const f = setup();
  refs(f, [[{ worktreePath: "/managed/sample-worktree", name: "sample-branch" }]]);
  const known = vi.fn();
  await expect(
    dispatchPrompt(f.invocation, "prompt", { existingWorktree: "/managed/missing" }, known),
  ).rejects.toBeInstanceOf(T3NotFoundError);
  expect(f.launch).not.toHaveBeenCalled();
  expect(f.create).not.toHaveBeenCalled();
  expect(known).not.toHaveBeenCalled();
});
it("stops at a repeated ref cursor", async () => {
  const f = setup();
  const list = vi.spyOn(f.client.vcs, "listRefs").mockResolvedValue({
    refs: [],
    isRepo: true,
    hasPrimaryRemote: false,
    nextCursor: 3,
    totalCount: 0,
  });
  await expect(
    dispatchPrompt(f.invocation, "prompt", { existingWorktree: "/managed/missing" }),
  ).rejects.toBeInstanceOf(T3NotFoundError);
  expect(list).toHaveBeenCalledTimes(2);
});
it("explicit options override the same model's inherited options", async () => {
  const f = setup();
  withOptions(f, [
    { id: "level", value: "low" },
    { id: "kept", value: "inherited" },
  ]);
  await dispatchPrompt(f.invocation, "prompt", { modelOption: ["level=high", "flag=false"] });
  expect(f.create.mock.calls[0]![0].modelSelection).toEqual({
    instanceId: "sample-provider",
    model: "sample-model",
    options: [
      { id: "kept", value: "inherited" },
      { id: "level", value: "high" },
      { id: "flag", value: false },
    ],
  });
});
it("does not inherit options across a different model", async () => {
  const f = setup();
  withOptions(f, [{ id: "level", value: "low" }]);
  await dispatchPrompt(f.invocation, "prompt", {
    model: "custom-model",
    modelOption: ["flag=true"],
  });
  expect(f.create.mock.calls[0]![0].modelSelection).toEqual({
    instanceId: "sample-provider",
    model: "custom-model",
    options: [{ id: "flag", value: true }],
  });
});
it.each([
  [{ modelOption: ["level=high"] }, [{ id: "level", value: "high" }]],
  [{ clearModelOptions: true }, []],
  [{ clearModelOptions: true, modelOption: ["flag=true"] }, [{ id: "flag", value: true }]],
] as const)("continuation with %j sends the thread model with %j", async (extra, options) => {
  const f = setup();
  withOptions(f, [{ id: "level", value: "low" }]);
  await dispatchPrompt(f.invocation, "prompt", {
    thread: f.existing.id,
    ...(extra as DispatchOptions),
  });
  expect(f.start).toHaveBeenCalledExactlyOnceWith({
    threadId: f.existing.id,
    text: "prompt",
    modelSelection: { instanceId: "sample-provider", model: "sample-model", options },
  });
});
it.each([
  [{ modelOption: ["missing=value"] }],
  [{ modelOption: ["flag=yes"] }],
  [{ thread: "sample-thread", modelOption: ["level=medium"] }],
])("rejects invalid model options before dispatch: %j", async (options) => {
  const f = setup();
  withOptions(f);
  await expect(dispatchPrompt(f.invocation, "prompt", options)).rejects.toBeInstanceOf(
    T3PreconditionError,
  );
  expect(f.create).not.toHaveBeenCalled();
  expect(f.start).not.toHaveBeenCalled();
  expect(f.update).not.toHaveBeenCalled();
});
