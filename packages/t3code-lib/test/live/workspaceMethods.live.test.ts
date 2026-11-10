// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * Terminal, repository and review methods on a real stock server, with a local
 * bare repository as the remote.
 */
import * as NodeCP from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { schemas } from "../../src/index.ts";
import { connect, hasLiveServer, refusal, waitFor } from "./liveClient.ts";
import { gitWith, initBareRepository, seedRepository } from "./localForge.ts";

const { isUnknownVariant } = schemas.common;
type TerminalEvent = schemas.terminal.TerminalAttachStreamEvent;
type MetadataEvent = schemas.terminal.TerminalMetadataStreamEvent;
type ProgressEvent = schemas.git.GitActionProgressEvent;

describe.skipIf(!hasLiveServer)("workspace methods", () => {
  const client = connect();
  let root: string;
  let bare: string;
  let cwd: string;
  const git = gitWith();

  beforeAll(async () => {
    root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-lib-workspace-"));
    bare = NodePath.join(root, "remote.git");
    // Review methods read only inside the server's workspace root.
    const config = await client.server.getConfig();
    cwd = await NodeFSP.mkdtemp(NodePath.join(config.cwd, "t3code-lib-workspace-"));
    initBareRepository(bare);
    await seedRepository(git, cwd, bare);
  });

  afterAll(async () => {
    await client.close();
    await NodeFSP.rm(root, { recursive: true, force: true });
    await NodeFSP.rm(cwd, { recursive: true, force: true });
  });

  it("clears and observes a terminal, and reports its metadata", async () => {
    const session = { threadId: NodeCrypto.randomUUID(), terminalId: "term-1" };
    const seen: Exclude<TerminalEvent, schemas.common.UnknownVariant<"type">>[] = [];
    const metadata: Exclude<MetadataEvent, schemas.common.UnknownVariant<"type">>[] = [];
    const observer = new AbortController();
    const metadataReader = new AbortController();
    const metadataRead = (async () => {
      const stream = client.rpc.stream(
        "subscribeTerminalMetadata",
        {},
        { signal: metadataReader.signal },
      );
      for await (const item of stream) {
        if (item.kind === "item" && !isUnknownVariant<"type">(item.value)) {
          metadata.push(item.value as (typeof metadata)[number]);
        }
      }
    })();
    try {
      await client.rpc.call("terminal.open", { ...session, cwd });
      const observed = (async () => {
        const stream = client.rpc.stream("terminal.observe", session, { signal: observer.signal });
        for await (const item of stream) {
          if (item.kind === "item" && !isUnknownVariant<"type">(item.value)) {
            seen.push(item.value as (typeof seen)[number]);
          }
        }
      })();
      await waitFor(
        async () => seen.find((event) => event.type === "snapshot"),
        "the observer's snapshot",
        { timeoutMs: 20_000, intervalMs: 100 },
      );
      await client.rpc.call("terminal.write", { ...session, data: "echo sample-output\n" });
      await waitFor(
        async () =>
          seen.find((event) => event.type === "output" && event.data.includes("sample-output")),
        "the observed output",
        { timeoutMs: 20_000, intervalMs: 100 },
      );
      await client.rpc.call("terminal.clear", session);
      await waitFor(
        async () => seen.find((event) => event.type === "cleared"),
        "the observed clear",
        { timeoutMs: 20_000, intervalMs: 100 },
      );
      observer.abort();
      await observed.catch(() => undefined);

      const listed = await waitFor(
        async () =>
          metadata.find(
            (event) =>
              (event.type === "upsert" && event.terminal.threadId === session.threadId) ||
              (event.type === "snapshot" &&
                event.terminals.some((entry) => entry.threadId === session.threadId)),
          ),
        "the terminal's metadata",
        { timeoutMs: 20_000, intervalMs: 100 },
      );
      expect(listed).toBeDefined();
      await client.rpc.call("terminal.close", { ...session, deleteHistory: true });
      await waitFor(
        async () =>
          metadata.find((event) => event.type === "remove" && event.threadId === session.threadId),
        "the terminal's removal",
        { timeoutMs: 20_000, intervalMs: 100 },
      );
    } finally {
      observer.abort();
      metadataReader.abort();
      await metadataRead.catch(() => undefined);
    }
  });

  it("refuses to clear an unknown terminal, with a typed record", async () => {
    const record = await refusal(
      client.rpc.call("terminal.clear", {
        threadId: NodeCrypto.randomUUID(),
        terminalId: "missing",
      }),
    );
    expect(record).toMatchObject({ _tag: "TerminalSessionLookupError", terminalId: "missing" });
  });

  it("initializes a repository, and refuses a driver kind with no driver", async () => {
    const fresh = NodePath.join(root, "fresh");
    await NodeFSP.mkdir(fresh);
    await client.rpc.call("vcs.init", { cwd: fresh, kind: "git" });
    expect(git(fresh, "rev-parse", "--is-inside-work-tree")).toBe("true");
    const record = await refusal(client.rpc.call("vcs.init", { cwd: fresh, kind: "unknown" }));
    expect(record).toMatchObject({
      _tag: "VcsUnsupportedOperationError",
      kind: "unknown",
    });
  });

  it("pulls from the remote, then reports up to date", async () => {
    const other = NodePath.join(root, "other");
    NodeCP.execFileSync("git", ["clone", bare, other], { stdio: "pipe" });
    await NodeFSP.writeFile(NodePath.join(other, "remote.txt"), "remote\n");
    git(other, "add", "remote.txt");
    git(other, "commit", "-m", "Remote change");
    git(other, "push");

    const pulled = await client.rpc.call("vcs.pull", { cwd });
    expect(pulled).toMatchObject({
      status: "pulled",
      refName: "main",
      upstreamRef: "origin/main",
    });
    const current = await client.rpc.call("vcs.pull", { cwd });
    expect(current.status).toBe("skipped_up_to_date");
  });

  it("reports branch changes through a passive status observer", async () => {
    git(cwd, "switch", "--create", "status-branch");
    await NodeFSP.writeFile(NodePath.join(cwd, "status.txt"), "one\ntwo\n");
    git(cwd, "add", "status.txt");
    git(cwd, "commit", "-m", "Status change");
    const refreshed = await client.rpc.call("vcs.refreshStatus", { cwd, localOnly: true });
    expect(refreshed.branchChanges).toMatchObject({ insertions: 2, deletions: 0 });
    const reader = new AbortController();
    try {
      for await (const item of client.rpc.stream(
        "subscribeVcsStatus",
        { cwd, includeRemote: false },
        { signal: reader.signal },
      )) {
        if (item.kind !== "item") throw item.error;
        const event = item.value;
        if (isUnknownVariant<"_tag">(event) || event._tag !== "snapshot") continue;
        expect(event.local.branchChanges).toMatchObject({ insertions: 2, deletions: 0 });
        break;
      }
    } finally {
      reader.abort();
      git(cwd, "switch", "main");
    }
  });

  it("reads a branch's commits and its diffs", async () => {
    git(cwd, "switch", "--create", "review-branch");
    await NodeFSP.writeFile(NodePath.join(cwd, "sample.txt"), "second\n");
    git(cwd, "add", "sample.txt");
    git(cwd, "commit", "-m", "Change the sample");
    await NodeFSP.writeFile(NodePath.join(cwd, "sample.txt"), "third\n");

    const { commits, truncated } = await client.rpc.call("review.getBranchCommits", {
      cwd,
      baseRef: "main",
    });
    expect(truncated).toBe(false);
    expect(commits.map((commit) => commit.subject)).toEqual(["Change the sample"]);

    const preview = await client.rpc.call("review.getDiffPreview", { cwd, baseRef: "main" });
    expect(Number.isNaN(Date.parse(preview.generatedAt))).toBe(false);
    const workingTree = preview.sources.find((source) => source.kind === "working-tree");
    const range = preview.sources.find((source) => source.kind === "branch-range");
    expect(workingTree?.diff).toContain("+third");
    expect(range?.diff).toContain("-first");

    const filtered = await client.rpc.call("review.getDiffPreview", {
      cwd,
      baseRef: "main",
      sourceKind: "working-tree",
      trackedOnly: true,
      metadataOnly: true,
    });
    expect(filtered.incomplete).toBe(true);
    expect(filtered.sources.map((source) => source.kind)).toEqual(["working-tree"]);
    expect(filtered.sources[0]).toMatchObject({
      diff: "",
      patchesDeferred: true,
      files: [{ path: "sample.txt" }],
    });

    const sha = commits[0]?.sha ?? "";
    const commit = await client.rpc.call("review.getDiffPreview", { cwd, commitSha: sha });
    const committed = commit.sources.find((source) => source.kind === "commit");
    expect(committed?.diff).toContain("+second");
    expect(committed?.commitSubject).toBe("Change the sample");

    const contents = await client.rpc.call("review.getDiffFileContents", {
      cwd,
      sourceKind: "branch-range",
      changeType: "change",
      baseRef: "main",
      headRef: "review-branch",
      oldPath: "sample.txt",
      newPath: "sample.txt",
    });
    // A branch range reads its new side from the working tree.
    expect(contents).toMatchObject({ oldContents: "first\n", newContents: "third\n" });
    git(cwd, "checkout", "--", "sample.txt");
    git(cwd, "switch", "main");
  });

  it("refuses a review outside the workspace root, with a typed record", async () => {
    const record = await refusal(client.rpc.call("review.getDiffPreview", { cwd: root }));
    expect(record).toMatchObject({ _tag: "VcsRepositoryDetectionError" });
  });

  it("commits and pushes with progress events, to a local remote", async () => {
    git(cwd, "switch", "--create", "action-branch");
    await NodeFSP.writeFile(NodePath.join(cwd, "action.txt"), "action\n");
    const hook = NodePath.join(cwd, ".git", "hooks", "pre-commit");
    await NodeFSP.writeFile(hook, "#!/bin/sh\necho sample-hook-output\n", { mode: 0o755 });
    const actionId = NodeCrypto.randomUUID();
    const events: Exclude<ProgressEvent, schemas.common.UnknownVariant<"kind">>[] = [];
    for await (const item of client.rpc.stream("git.runStackedAction", {
      actionId,
      cwd,
      action: "commit_push",
      commitMessage: "Add the action file",
      filePaths: ["action.txt"],
    })) {
      if (item.kind !== "item") throw item.error;
      if (isUnknownVariant<"kind">(item.value)) throw new Error("Unknown progress event.");
      events.push(item.value as (typeof events)[number]);
    }
    await NodeFSP.rm(hook);

    const kinds = events.map((event) => event.kind);
    expect(kinds).toEqual(expect.arrayContaining(["action_started", "phase_started"]));
    expect(kinds).toContain("hook_started");
    expect(kinds).toContain("hook_output");
    expect(kinds).toContain("hook_finished");
    const finished = events.find((event) => event.kind === "action_finished");
    if (finished?.kind !== "action_finished") throw new Error("The action did not finish.");
    expect(finished.actionId).toBe(actionId);
    expect(finished.result).toMatchObject({
      action: "commit_push",
      commit: { status: "created", subject: "Add the action file" },
      push: { status: "pushed", branch: "action-branch" },
      pr: { status: "skipped_not_requested" },
    });
    expect(git(bare, "rev-parse", "action-branch")).toBe(git(cwd, "rev-parse", "HEAD"));
    git(cwd, "switch", "main");
  });

  it("refuses to resolve a pull request with no known host, with a typed record", async () => {
    const record = await refusal(
      client.rpc.call("git.resolvePullRequest", { cwd, reference: "1" }),
    );
    expect(record).toMatchObject({ _tag: "SourceControlProviderError" });
  });
});
