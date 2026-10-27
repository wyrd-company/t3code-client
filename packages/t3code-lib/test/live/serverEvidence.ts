// ---
// relationships:
//   verifies: testing
// ---
import * as NodeFSP from "node:fs/promises";

// A short-lived descendant can be a zombie until its parent reaps it. Keep
// requiring signal-zero absence while allowing that observed exit to settle.
const ABSENCE_RECHECKS = 10;
const ABSENCE_RECHECK_MS = 10;

async function confirmProcessAbsent(pid: number): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    if (processAbsent(pid)) return true;
    if (attempt === ABSENCE_RECHECKS) return false;
    await new Promise((resolve) => setTimeout(resolve, ABSENCE_RECHECK_MS));
  }
}

type ProcessIdentity = {
  pid: number;
  stat: string | null;
  executable: string | null;
  absentDuringCapture?: true;
};

/** Capture only the owned launcher's descendants, including the stock native server. */
export async function processIdentities(pid: number): Promise<ProcessIdentity[]> {
  if (process.platform !== "linux") return [{ pid, stat: null, executable: null }];
  const identity: ProcessIdentity = { pid, stat: null, executable: null };
  let children: string;
  try {
    identity.stat = await NodeFSP.readFile(`/proc/${pid}/stat`, "utf8");
    identity.executable = await NodeFSP.readlink(`/proc/${pid}/exe`);
    children = await NodeFSP.readFile(`/proc/${pid}/task/${pid}/children`, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // A vanished proc entry alone is not proof that the process has exited.
    if ((code === "ENOENT" || code === "ESRCH") && (await confirmProcessAbsent(pid))) {
      return [{ ...identity, absentDuringCapture: true }];
    }
    throw error;
  }
  const descendants = await Promise.all(
    children
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((child) => processIdentities(Number(child))),
  );
  return [identity, ...descendants.flat()];
}

export function processAbsent(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
    throw error;
  }
}
