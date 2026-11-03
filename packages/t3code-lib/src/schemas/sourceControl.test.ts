// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { redactSecrets } from "../internal/redact.ts";
import { AgentSessionScanResult } from "./agentSessions.ts";
import { ProjectCloneListEvent, ProjectCloneStartInput } from "./projectClone.ts";
import { decodeRpcErrorRecord, isRpcErrorOfTag } from "./rpcErrors.ts";
import {
  SourceControlAppAccess,
  SourceControlCloneRepositoryInput,
  SourceControlPublishRepositoryInput,
  SourceControlPublishRepositoryResult,
  SourceControlSignInPrompt,
  SourceControlSignInResult,
} from "./sourceControl.ts";

const repository = {
  provider: "sample-forge",
  nameWithOwner: "sample/repository",
  url: "https://forge.example.invalid/sample/repository",
  sshUrl: "git@forge.example.invalid:sample/repository.git",
};

describe("source control inputs", () => {
  it("takes only the contract's protocols and visibilities", () => {
    const clone = { destinationPath: "/sample" };
    expect(SourceControlCloneRepositoryInput.safeParse({ ...clone, protocol: "ssh" }).success).toBe(
      true,
    );
    expect(SourceControlCloneRepositoryInput.safeParse({ ...clone, protocol: "ftp" }).success).toBe(
      false,
    );
    const publish = {
      cwd: "/sample",
      provider: "sample-forge",
      repository: "sample/repository",
    };
    expect(
      SourceControlPublishRepositoryInput.safeParse({ ...publish, visibility: "private" }).success,
    ).toBe(true);
    expect(
      SourceControlPublishRepositoryInput.safeParse({ ...publish, visibility: "internal" }).success,
    ).toBe(false);
  });

  it("refuses a provider kind outside the contract's form", () => {
    const input = { destinationPath: "/sample", provider: "Not A Slug" };
    expect(SourceControlCloneRepositoryInput.safeParse(input).success).toBe(false);
  });

  it("gives a clone project the fields of a clone", () => {
    const input = {
      projectId: "sample",
      title: "Sample",
      createdAt: "2026-01-01T00:00:00.000Z",
      destinationPath: "/sample",
    };
    expect(ProjectCloneStartInput.safeParse({ ...input, protocol: "https" }).success).toBe(true);
    expect(ProjectCloneStartInput.safeParse({ ...input, protocol: "ftp" }).success).toBe(false);
  });
});

describe("source control results", () => {
  it("decodes a finished sign-in, which no live test can reach", () => {
    const prompt = {
      userCode: "SAMPLE-CODE",
      verificationUri: "https://forge.example.invalid/device",
      expiresAt: 1_700_000_000_000,
    };
    expect(SourceControlSignInPrompt.parse(prompt)).toEqual(prompt);
    expect(SourceControlSignInResult.parse({ account: "sample" })).toEqual({ account: "sample" });
    expect(redactSecrets(prompt)).toMatchObject({ userCode: "[redacted]" });
  });

  it("keeps a newer server's values", () => {
    expect(SourceControlAppAccess.parse({ status: "newer-status" }).status).toBe("newer-status");
    const published = SourceControlPublishRepositoryResult.parse({
      repository,
      remoteName: "origin",
      remoteUrl: repository.sshUrl,
      branch: "main",
      status: "newer-status",
      newerField: true,
    });
    expect(published).toMatchObject({ status: "newer-status", newerField: true });
  });

  it("decodes a clone's progress, with and without an older server's `stalled`", () => {
    const clone = {
      projectId: "sample",
      remoteUrl: repository.sshUrl,
      destinationPath: "/sample",
      repository,
      phase: "running",
      stage: "receiving",
      percent: 40,
      detail: "1.0 MiB/s",
      error: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: null,
      sequence: 3,
    };
    expect(ProjectCloneListEvent.parse([clone, { ...clone, stalled: true }])).toHaveLength(2);
    expect(ProjectCloneListEvent.safeParse([{ ...clone, percent: 101 }]).success).toBe(false);
  });

  it("decodes a candidate with and without its Git identity", () => {
    const candidate = {
      path: "/sample",
      title: "sample",
      sources: ["codex", "newer-agent"],
      threadCount: 2,
      lastActiveAt: null,
      alreadyImported: false,
    };
    const scan = AgentSessionScanResult.parse({
      candidates: [
        candidate,
        { ...candidate, git: null },
        { ...candidate, git: { remoteKey: "sample", repository: "sample/repository" } },
      ],
      scannedAt: "2026-01-01T00:00:00.000Z",
      truncated: true,
    });
    expect(scan.candidates).toHaveLength(3);
    expect(scan.truncated).toBe(true);
  });
});

describe("source control failures", () => {
  it.each([
    [
      "SourceControlSignInError",
      { provider: "sample-forge", host: "sample", reason: "denied", detail: "Sample." },
    ],
    [
      "SourceControlRepositoryError",
      { provider: "unknown", operation: "cloneRepository", detail: "Sample." },
    ],
    ["AgentSessionImportProjectNotFoundError", { projectId: "sample" }],
    ["AgentSessionImportProjectChangedError", { projectId: "sample" }],
    ["AgentSessionScanError", { operation: "read-projects", cause: { message: "Sample." } }],
  ] as const)("decodes %s", (tag, fields) => {
    expect(isRpcErrorOfTag(decodeRpcErrorRecord({ _tag: tag, ...fields }), tag)).toBe(true);
  });
});
