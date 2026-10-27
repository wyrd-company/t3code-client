// ---
// relationships:
//   implements: command-line
// ---
import * as NodePath from "node:path";
import type { OrchestrationProjectShell, T3Client } from "@wyrd-company/t3code-lib";
import { missingResource, type DispatchOptions } from "./selection.ts";

export type LaunchWorkspace = Parameters<T3Client["threads"]["launch"]>[0]["workspace"];

/** The project's current checkout when no explicit base ref is supplied. */
export const defaultWorktreeBaseRef = "HEAD";

/** Server page bound for vcs.listRefs. */
const refPageLimit = 200;

/**
 * Select the launch workspace strategy. Undefined selects the project root.
 * An omitted start-from-origin stays omitted so the server applies its default.
 */
export async function selectWorkspace(
  client: T3Client,
  project: OrchestrationProjectShell,
  options: DispatchOptions,
  signal?: AbortSignal,
): Promise<LaunchWorkspace | undefined> {
  if (options.worktree)
    return {
      type: "worktree",
      baseRef: options.baseRef ?? defaultWorktreeBaseRef,
      ...(options.branch === undefined ? {} : { branch: options.branch }),
      ...(options.startFromOrigin === undefined
        ? {}
        : { startFromOrigin: options.startFromOrigin }),
    };
  if (options.existingWorktree === undefined) return undefined;
  return {
    type: "existing_worktree",
    ...(await advertisedWorktree(client, project, options.existingWorktree, signal)),
  };
}

/**
 * Bind an existing worktree by the server's own path and checked-out branch.
 * Only a worktree the server advertises for the project's repository is accepted.
 */
async function advertisedWorktree(
  client: T3Client,
  project: OrchestrationProjectShell,
  path: string,
  signal?: AbortSignal,
): Promise<{ worktreePath: string; branch: string }> {
  const wanted = NodePath.resolve(path);
  const visited = new Set<number>();
  let cursor: number | undefined;
  do {
    const page = await client.vcs.listRefs(
      {
        cwd: project.workspaceRoot,
        refKind: "local",
        limit: refPageLimit,
        ...(cursor === undefined ? {} : { cursor }),
      },
      signal,
    );
    const match = page.refs.find(
      (ref) => ref.worktreePath !== null && NodePath.resolve(ref.worktreePath) === wanted,
    );
    if (match?.worktreePath != null)
      return { worktreePath: match.worktreePath, branch: match.name };
    if (cursor !== undefined) visited.add(cursor);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined && !visited.has(cursor));
  throw missingResource("worktree");
}
