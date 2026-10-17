// ---
// relationships:
//   verifies: testing
// ---
import * as NodeFSP from "node:fs/promises";

/** Capture only the owned launcher's descendants, including the stock native server. */
export async function processIdentities(
  pid: number,
): Promise<{ pid: number; stat: string | null; executable: string | null }[]> {
  if (process.platform !== "linux") return [{ pid, stat: null, executable: null }];
  const stat = await NodeFSP.readFile(`/proc/${pid}/stat`, "utf8");
  const executable = await NodeFSP.readlink(`/proc/${pid}/exe`);
  const children = await NodeFSP.readFile(`/proc/${pid}/task/${pid}/children`, "utf8");
  const descendants = await Promise.all(
    children
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((child) => processIdentities(Number(child))),
  );
  return [{ pid, stat, executable }, ...descendants.flat()];
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
