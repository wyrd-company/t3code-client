// ---
// relationships:
//   verifies: output-contract
// ---
import * as NodeFSP from "node:fs/promises";
import { vi } from "vite-plus/test";
import { T3Client, type TurnHandle } from "@wyrd-company/t3code-lib";
import { main } from "../src/main.ts";
import type { CommandSurface } from "../src/registration.ts";
import { dispatchHandler } from "../src/execution/run.ts";
import { followRun, followPolicy } from "../src/execution/follow.ts";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export async function holdReceipt<T extends (...args: never[]) => unknown>(
  spy: import("vite-plus/test").MockInstance<T>,
  entered: ReturnType<typeof deferred<void>>,
  release: ReturnType<typeof deferred<void>>,
) {
  const original = spy.getMockImplementation()!;
  spy.mockImplementation((async (...args: Parameters<T>) => {
    entered.resolve();
    await release.promise;
    return Reflect.apply(original, undefined, args);
  }) as Parameters<typeof spy.mockImplementation>[0]);
}
export async function signalFixture(path = "root", waiting = true) {
  const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
  const stdout: string[] = [],
    stderr: string[] = [];
  const project = {
    id: "sample-project",
    defaultModelSelection: { instanceId: "sample-provider", model: "sample-model" },
  };
  const thread = {
    id: "sample-thread",
    projectId: project.id,
    modelSelection: project.defaultModelSelection,
  };
  const turn = { threadId: thread.id, runId: "linked-run" } as TurnHandle;
  const launchResult = {
    threadId: thread.id,
    projection: {
      messages: [{ id: "sample-message", role: "user", runId: "linked-run" }],
      runs: [],
    },
  };
  const sessionResult = {
    authenticated: true,
    scopes: ["orchestration:read", "orchestration:operate"],
  };
  const session = vi
    .spyOn(client.auth, "sessionState")
    .mockResolvedValue(sessionResult as Awaited<ReturnType<typeof client.auth.sessionState>>);
  vi.spyOn(client.server, "getConfig").mockResolvedValue({
    settings: {},
    providers: [
      { instanceId: "sample-provider", enabled: true, models: [{ slug: "sample-model" }] },
    ],
  } as unknown as Awaited<ReturnType<typeof client.server.getConfig>>);
  vi.spyOn(client.server, "getSettings").mockResolvedValue({});
  vi.spyOn(client.projects, "ensureScratch").mockResolvedValue({ projectId: project.id } as Awaited<
    ReturnType<typeof client.projects.ensureScratch>
  >);
  vi.spyOn(client.projects, "get").mockResolvedValue(
    project as Awaited<ReturnType<typeof client.projects.get>>,
  );
  vi.spyOn(client.threads, "get").mockResolvedValue(
    thread as Awaited<ReturnType<typeof client.threads.get>>,
  );
  const create = vi
    .spyOn(client.threads, "create")
    .mockResolvedValue(thread as Awaited<ReturnType<typeof client.threads.create>>);
  const update = vi.spyOn(client.threads, "update").mockResolvedValue();
  const start = vi.spyOn(client.threads, "startTurn").mockResolvedValue(turn);
  const launch = vi
    .spyOn(client.threads, "launch")
    .mockResolvedValue(
      launchResult as unknown as Awaited<ReturnType<typeof client.threads.launch>>,
    );
  const interrupt = vi.spyOn(client.threads, "interrupt").mockResolvedValue();
  const surface = JSON.parse(
    await NodeFSP.readFile(
      new URL("../../../docs/specifications/assets/cli-surface.json", import.meta.url),
      "utf8",
    ),
  ) as CommandSurface;
  const kind = path === "send" ? "send" : path === "start" ? "start" : "run";
  const argv =
    kind === "send"
      ? ["thread", "send", thread.id, "sample prompt"]
      : kind === "start"
        ? ["thread", "start", "sample prompt", ...(waiting ? ["--wait"] : [])]
        : ["run", "sample prompt"];
  if (path === "worktree") argv.push("--worktree");
  if (path === "continuation") argv.push("--thread", thread.id, "--title", "Sample title");
  const handler = dispatchHandler(kind, async () => ({ followRun, followPolicy }));
  function run() {
    return main(
      [...argv, "--json"],
      surface,
      { stdout: (s) => stdout.push(s), stderr: (s) => stderr.push(s) },
      {
        [kind === "run" ? "run" : `thread ${kind}`]: async (args, command, invocation) => {
          vi.spyOn(invocation, "client").mockResolvedValue(client);
          await handler(args, command, invocation);
        },
      },
    );
  }
  return {
    client,
    stdout,
    stderr,
    session,
    sessionResult,
    create,
    update,
    start,
    turn,
    launch,
    launchResult,
    interrupt,
    run,
  };
}
