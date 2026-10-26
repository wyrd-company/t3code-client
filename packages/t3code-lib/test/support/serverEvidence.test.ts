// ---
// relationships:
//   verifies: library-testing
// ---
import * as NodeFSP from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { processIdentities } from "../live/serverEvidence.ts";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn(), readlink: vi.fn() }));

const root = 41001;
const child = 41002;
const sibling = 41003;
const failure = (code: string) => Object.assign(new Error(code), { code });
const stat = (pid: number) => `stat-${pid}`;
const executable = (pid: number) => `/example/bin/process-${pid}`;

// The fs boundary controls the exact exit point; no timing or real PID is used.
describe.runIf(process.platform === "linux")("owned process evidence capture", () => {
  beforeEach(() => {
    vi.mocked(NodeFSP.readFile).mockImplementation(async (path) => {
      const pid = Number(String(path).split("/")[2]);
      return String(path).endsWith("/stat") ? stat(pid) : pid === root ? `${child} ${sibling}` : "";
    });
    vi.mocked(NodeFSP.readlink).mockImplementation(async (path) =>
      executable(Number(String(path).split("/")[2])),
    );
    vi.spyOn(process, "kill").mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("retains full recursive identities for surviving descendants", async () => {
    expect(await processIdentities(root)).toEqual(
      [root, child, sibling].map((pid) => ({ pid, stat: stat(pid), executable: executable(pid) })),
    );
  });

  it.each(["stat", "exe", "children"])(
    "retains a partial row and sibling when the child disappears at %s",
    async (stage) => {
      const gone = failure("ENOENT");
      const originalRead = vi.mocked(NodeFSP.readFile).getMockImplementation()!;
      vi.mocked(NodeFSP.readFile).mockImplementation(async (path, options) => {
        if (String(path) === `/proc/${child}/stat` && stage === "stat") throw gone;
        if (String(path) === `/proc/${child}/task/${child}/children` && stage === "children")
          throw gone;
        return originalRead(path, options);
      });
      if (stage === "exe") {
        vi.mocked(NodeFSP.readlink).mockImplementation(async (path) => {
          if (String(path) === `/proc/${child}/exe`) throw gone;
          return executable(Number(String(path).split("/")[2]));
        });
      }
      vi.mocked(process.kill).mockImplementation((pid) => {
        if (pid === child) throw failure("ESRCH");
        return true;
      });
      const rows = await processIdentities(root);
      expect(rows).toEqual([
        { pid: root, stat: stat(root), executable: executable(root) },
        {
          pid: child,
          stat: stage === "stat" ? null : stat(child),
          executable: stage === "children" ? executable(child) : null,
          absentDuringCapture: true,
        },
        { pid: sibling, stat: stat(sibling), executable: executable(sibling) },
      ]);
      expect(process.kill).toHaveBeenCalledWith(child, 0);
    },
  );

  it("accepts ESRCH only with an independent absence check", async () => {
    vi.mocked(NodeFSP.readFile).mockRejectedValue(failure("ESRCH"));
    vi.mocked(process.kill).mockImplementation(() => {
      throw failure("ESRCH");
    });
    expect(await processIdentities(root)).toEqual([
      { pid: root, stat: null, executable: null, absentDuringCapture: true },
    ]);
  });

  it("rejects missing proc data while the process still exists", async () => {
    const error = failure("ENOENT");
    vi.mocked(NodeFSP.readFile).mockRejectedValue(error);
    await expect(processIdentities(root)).rejects.toBe(error);
  });

  it("propagates permission errors without declaring absence", async () => {
    const error = failure("EACCES");
    vi.mocked(NodeFSP.readlink).mockRejectedValue(error);
    await expect(processIdentities(root)).rejects.toBe(error);
    expect(process.kill).not.toHaveBeenCalled();
  });

  it("propagates failure to verify absence", async () => {
    vi.mocked(NodeFSP.readFile).mockRejectedValue(failure("ENOENT"));
    const error = failure("EPERM");
    vi.mocked(process.kill).mockImplementation(() => {
      throw error;
    });
    await expect(processIdentities(root)).rejects.toBe(error);
  });
});
