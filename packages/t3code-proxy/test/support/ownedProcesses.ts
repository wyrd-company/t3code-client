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
