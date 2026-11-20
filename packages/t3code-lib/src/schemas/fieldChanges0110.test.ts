// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { AcpRegistrySession } from "./acpRegistry.ts";
import { AssetCreateUrlInput } from "./assets.ts";
import { LaunchEditorInput } from "./editor.ts";
import { ModelSelection } from "./orchestration/model.ts";
import { PreviewOpenInput } from "./preview.ts";
import { ProjectReadFileInput, ProjectWriteFileResult } from "./projects.ts";
import { ProjectListIgnoredFilesInput } from "./projectsIgnoredFiles.ts";
import { ProviderAuthInteraction, ProviderAuthResponse } from "./providerSetup.ts";
import { ReviewDiffFileStat } from "./review.ts";
import { decodeRpcErrorRecord } from "./rpcErrors.ts";
import { ProjectReadFileError } from "./rpcErrors/projects.ts";
import { ScheduledTaskListResult } from "./scheduledTask.ts";
import { TerminalAttachInput, TerminalSessionSnapshot, TerminalWriteInput } from "./terminal.ts";
import { UsageBucket, UsageSourceFingerprint, UsageSummaryInput } from "./usage.ts";
import { VcsBranchStatus } from "./vcs.ts";

const session = { threadId: "thread-1", terminalId: "term-1" };

function rejects(schema: { safeParse(value: unknown): { success: boolean } }, value: unknown) {
  expect(schema.safeParse(value).success).toBe(false);
}

describe("terminal, project and editor changes of 0.1.10", () => {
  it("bounds attached history, writes binary data and replies, and keeps a start failure", () => {
    expect(TerminalAttachInput.parse({ ...session, maxHistoryBytes: 0 }).maxHistoryBytes).toBe(0);
    rejects(TerminalAttachInput, { ...session, maxHistoryBytes: -1 });
    const write = { ...session, data: "\u001b[0n", binary: true, reply: true };
    expect(TerminalWriteInput.parse(write)).toEqual(write);
    rejects(TerminalWriteInput, { ...write, reply: "yes" });
    const snapshot = {
      ...session,
      cwd: "/srv/sample",
      worktreePath: null,
      status: "error",
      pid: null,
      history: "",
      exitCode: null,
      exitSignal: null,
      label: "Terminal",
      updatedAt: "2026-01-01T00:00:00.000Z",
      error: "Shell not found.",
    };
    expect(TerminalSessionSnapshot.parse(snapshot).error).toBe("Shell not found.");
    rejects(TerminalSessionSnapshot, { ...snapshot, error: "" });
  });

  it("keeps project file paths exactly and searches ignored files", () => {
    const read = ProjectReadFileInput.parse({ cwd: "/srv/sample", relativePath: " notes.md " });
    expect(read.relativePath).toBe(" notes.md ");
    expect(ProjectWriteFileResult.parse({ relativePath: "a.md " }).relativePath).toBe("a.md ");
    const error = ProjectReadFileError.parse({
      _tag: "ProjectReadFileError",
      relativePath: " notes.md",
      resolvedPath: "/srv/sample/ notes.md",
      operationPath: "/srv/sample/ notes.md",
      message: "Not found.",
    });
    expect(error).toMatchObject({
      relativePath: " notes.md",
      resolvedPath: "/srv/sample/ notes.md",
    });
    expect(ProjectListIgnoredFilesInput.parse({ cwd: "/srv/sample", query: " env " }).query).toBe(
      "env",
    );
    rejects(ProjectListIgnoredFilesInput, { cwd: "/srv/sample", query: "x".repeat(257) });
  });

  it("opens an editor at an exact position in a project", () => {
    const input = {
      cwd: "/srv/sample/a.ts",
      editor: "vscode",
      position: { line: 3, column: 1 },
      projectRoot: "/srv/sample",
    };
    expect(LaunchEditorInput.parse(input)).toEqual(input);
    expect(LaunchEditorInput.parse({ ...input, position: {} }).position).toEqual({});
    rejects(LaunchEditorInput, { ...input, position: { line: 0 } });
  });
});

describe("provider, asset and other field changes of 0.1.10", () => {
  it("reads only http sign-in URLs and binary terminal answers", () => {
    const browser = { type: "browser", id: "flow-1", requiresConsent: false };
    expect(ProviderAuthInteraction.parse({ ...browser, url: "https://sign-in.invalid" })).toEqual({
      ...browser,
      url: "https://sign-in.invalid",
    });
    rejects(ProviderAuthInteraction, { ...browser, url: "javascript:alert(1)" });
    const answer = { type: "terminal", data: "\u0003", binary: true };
    expect(ProviderAuthResponse.parse(answer)).toEqual(answer);
    rejects(ProviderAuthResponse, { ...answer, binary: "yes" });
  });

  it("reads a null options of a model selection as absent", () => {
    expect(
      ModelSelection.parse({ instanceId: "sample", model: "sample-model", options: null }),
    ).toEqual({ instanceId: "sample", model: "sample-model" });
  });

  it("names theme backgrounds and host-only media as assets", () => {
    const background = { resource: { _tag: "environment-theme-background", themeId: "night" } };
    expect(AssetCreateUrlInput.parse(background)).toEqual(background);
    rejects(AssetCreateUrlInput, {
      resource: { _tag: "environment-theme-background", themeId: "dark" },
    });
    const media = {
      resource: { _tag: "media-file", threadId: "thread-1", path: "out.png", hostOnly: true },
    };
    expect(AssetCreateUrlInput.parse(media)).toEqual(media);
    rejects(AssetCreateUrlInput, { resource: { ...media.resource, hostOnly: false } });
  });

  it("reads session history, change types, a schedule zone and usage fields", () => {
    const acp = {
      sessionId: "session-1",
      cwd: "/srv/sample",
      additionalDirectories: [],
      title: null,
      updatedAt: null,
      importedThreadId: "thread-1",
      nativeHistoryPending: true,
    };
    expect(AcpRegistrySession.parse(acp).nativeHistoryPending).toBe(true);
    rejects(AcpRegistrySession, { ...acp, nativeHistoryPending: "yes" });
    const stat = { path: "b.ts", previousPath: "a.ts", additions: 0, deletions: 0 };
    expect(ReviewDiffFileStat.parse({ ...stat, changeType: "rename-pure" }).changeType).toBe(
      "rename-pure",
    );
    rejects(ReviewDiffFileStat, { ...stat, changeType: "moved" });
    expect(ScheduledTaskListResult.parse({ tasks: [], timeZone: "Etc/UTC" }).timeZone).toBe(
      "Etc/UTC",
    );
    rejects(ScheduledTaskListResult, { tasks: [], timeZone: " " });
    const input = {
      sinceDay: "2026-01-01",
      untilDay: "2026-01-02",
      timeZone: "Etc/UTC",
      provisional: true,
    };
    expect(UsageSummaryInput.parse(input).provisional).toBe(true);
    rejects(UsageSummaryInput, { ...input, provisional: "yes" });
    const fingerprint = {
      hostId: "host-1",
      provider: "codex",
      resolvedHomePath: "/home/sample",
      volumeId: "1:2",
      physicalSourceId: "source-1",
    };
    expect(UsageSourceFingerprint.parse(fingerprint).physicalSourceId).toBe("source-1");
    rejects(UsageSourceFingerprint, { ...fingerprint, physicalSourceId: " " });
    rejects(UsageBucket.shape.unpricedTokens, -1);
  });

  it("reads a removed checkout and a checkpoint storage failure", () => {
    expect(VcsBranchStatus.parse({ refName: null, isRepo: false })).toEqual({
      refName: null,
      isRepo: false,
    });
    rejects(VcsBranchStatus, { refName: null, isRepo: "no" });
    const failure = {
      _tag: "VcsCheckpointStorageError",
      operation: "captureCheckpoint",
      cwd: "/srv/sample",
      stage: "isolate",
      cause: "disk full",
    };
    expect(decodeRpcErrorRecord(failure)).toEqual(failure);
    expect(decodeRpcErrorRecord({ ...failure, stage: 1 })).toMatchObject({ unknown: true });
  });

  it("opens a preview tab with its appearance and zoom", () => {
    const open = { threadId: "thread-1", colorScheme: "dark", zoomFactor: 1.25 };
    expect(PreviewOpenInput.parse(open)).toEqual(open);
    rejects(PreviewOpenInput, { ...open, zoomFactor: 1.3 });
  });
});
