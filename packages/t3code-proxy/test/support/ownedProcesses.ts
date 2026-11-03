// ---
// relationships:
//   verifies: proxy
// ---
import type { ChildProcess } from "node:child_process";

const ended = (child: ChildProcess) => child.exitCode !== null || child.signalCode !== null;

/** Stops one owned process: SIGTERM, then SIGKILL when it has not exited within the grace time. */
async function stopOwned(child: ChildProcess, graceMs: number) {
  if (ended(child)) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), graceMs);
  });
  const isLate = await Promise.race([exited.then(() => false), late]);
  clearTimeout(timer);
  if (!isLate) return;
  child.kill("SIGKILL");
  await exited;
}

/** Stops every owned process in reverse start order. One that ignores SIGTERM holds back no other. */
export async function stopAllOwned(children: readonly ChildProcess[], graceMs: number) {
  for (const child of children.toReversed()) await stopOwned(child, graceMs);
}

/**
 * Holds the processes that one run owns. A signal can start the stop while setup still starts
 * processes, so `own` ends a process that comes after the stop began, and fails that setup.
 */
export function ownedProcesses(graceMs: number) {
  const children: ChildProcess[] = [];
  let stopping: Promise<void> | undefined;
  return {
    own<Child extends ChildProcess>(child: Child) {
      if (stopping) {
        child.kill("SIGTERM");
        throw new Error("The run is stopping, so it starts no process.");
      }
      children.push(child);
      return child;
    },
    stop: () => (stopping ??= stopAllOwned(children, graceMs)),
  };
}
