// ---
// relationships:
//   verifies: command-line
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { beforeAll, expect, it } from "vite-plus/test";
import { threadId } from "@wyrd-company/t3code-lib";
import { liveCatalogSelection } from "../support/liveCatalog.ts";
import {
  agent,
  cli,
  client,
  directory,
  issuer,
  ownedProjects,
  ownedThreads,
  record,
  runCommand,
  startCommand,
  useDispatchHarness,
} from "./dispatchHarness.ts";

useDispatchHarness("launch-controls");

let repository: string;
let boundWorktree: string;
let validationCommand: string[];
/** One advertised option of the live subject model, chosen from its descriptors. */
let advertised: { id: string; raw: string; value: string | boolean; invalid: string } | undefined;

function git(cwd: string, ...args: string[]) {
  NodeChildProcess.execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
  });
}

beforeAll(async () => {
  repository = NodePath.join(directory, "repository");
  await NodeFSP.mkdir(repository);
  git(repository, "init", "-q", "-b", "main");
  await NodeFSP.writeFile(NodePath.join(repository, "sample.txt"), "sample\n");
  git(repository, "add", "sample.txt");
  git(
    repository,
    "-c",
    "user.name=Sample",
    "-c",
    "user.email=sample@example.invalid",
    "commit",
    "-q",
    "-m",
    "sample",
  );
  boundWorktree = NodePath.join(directory, "bound-worktree");
  git(repository, "worktree", "add", "-q", "-b", "sample-bound", boundWorktree);
  repository = await NodeFSP.realpath(repository);
  boundWorktree = await NodeFSP.realpath(boundWorktree);
  const selection = agent
    ? { instanceId: "codex", model: "gpt-6-luna" }
    : await liveCatalogSelection(issuer);
  validationCommand = ["run", "--provider", selection.instanceId, "--model", selection.model];
  const config = await client.server.getConfig();
  const model = config.providers
    .find((provider) => provider.instanceId === selection.instanceId)
    ?.models.find((candidate) => candidate.slug === selection.model);
  for (const entry of model?.capabilities?.optionDescriptors ?? []) {
    if ((entry as { unknown?: unknown }).unknown === true) continue;
    const descriptor = entry as Exclude<typeof entry, { unknown: true }>;
    if (descriptor.type === "boolean") {
      advertised = { id: descriptor.id, raw: "false", value: false, invalid: "maybe" };
      break;
    }
    const choice = descriptor.type === "select" ? descriptor.options[0] : undefined;
    if (choice !== undefined) {
      advertised = {
        id: descriptor.id,
        raw: choice.id,
        value: choice.id,
        invalid: "no-such-choice",
      };
      break;
    }
  }
  record({
    case: "advertised option",
    id: advertised?.id ?? null,
    value: advertised?.value ?? null,
  });
});

async function projectFor(root: string) {
  const project = (await client.projects.list()).find(
    (candidate) => candidate.workspaceRoot === root,
  );
  if (project) ownedProjects.add(project.id);
  return project;
}

it("rejects invalid launch controls before any thread exists", async () => {
  const before = (await client.threads.list()).map((thread) => thread.id).sort();
  const cases: [string[], number][] = [
    [["--model-option", "unadvertised-sample=value"], 2],
    [["--existing-worktree", boundWorktree, "--worktree"], 2],
    [["--project-path", repository, "--existing-worktree", NodePath.join(directory, "absent")], 10],
  ];
  if (advertised) cases.push([["--model-option", `${advertised.id}=${advertised.invalid}`], 2]);
  for (const [args, exit] of cases) {
    const result = await cli([...validationCommand, "sample prompt", ...args, "--json"]);
    record({ case: "rejected launch control", args, exit: result.exit });
    expect(result.exit, args.join(" ")).toBe(exit);
    expect(JSON.parse(result.stdout).threadId).toBeNull();
  }
  await projectFor(repository);
  expect((await client.threads.list()).map((thread) => thread.id).sort()).toEqual(before);
});

it.skipIf(!agent)(
  "binds an advertised existing worktree and applies, then clears, model options",
  async () => {
    const options = advertised ? ["--model-option", `${advertised.id}=${advertised.raw}`] : [];
    const started = await cli([
      ...startCommand,
      "Reply SAMPLE only.",
      "--project-path",
      repository,
      "--existing-worktree",
      boundWorktree,
      ...options,
      "--json",
    ]);
    expect(started.exit, started.stderr).toBe(0);
    const id = JSON.parse(started.stdout).data.threadId as string;
    ownedThreads.add(id);
    await projectFor(repository);
    const projection = await client.threads.projection(threadId(id));
    expect(projection.thread.worktreePath).toBe(boundWorktree);
    expect(projection.thread.branch).toBe("sample-bound");
    if (advertised)
      expect(projection.thread.modelSelection.options).toContainEqual({
        id: advertised.id,
        value: advertised.value,
      });
    const continued = await cli([
      ...runCommand,
      "Reply SAMPLE only.",
      "--thread",
      id,
      "--clear-model-options",
      "--json",
    ]);
    expect(continued.exit, continued.stderr).toBe(0);
    const runId = JSON.parse(continued.stdout).runId as string;
    const after = await client.threads.projection(threadId(id));
    const run = after.runs.find((candidate) => candidate.id === runId);
    expect(run?.modelSelection.options ?? []).toEqual([]);
    record({ case: "existing worktree", threadId: id, runId, branch: projection.thread.branch });
  },
);

it.skipIf(!agent)("creates a named worktree branch with explicit local start", async () => {
  const result = await cli([
    ...runCommand,
    "Reply SAMPLE only.",
    "--project-path",
    repository,
    "--worktree",
    "--branch",
    "sample-created",
    "--no-start-from-origin",
    "--json",
  ]);
  expect(result.exit, result.stderr).toBe(0);
  const id = JSON.parse(result.stdout).threadId as string;
  ownedThreads.add(id);
  await projectFor(repository);
  const projection = await client.threads.projection(threadId(id));
  expect(projection.thread.branch).toBe("sample-created");
  expect(projection.thread.worktreePath).not.toBeNull();
  record({ case: "new worktree", threadId: id, branch: projection.thread.branch });
});
