import { describe, expect, it } from "vite-plus/test";

import {
  ExecutionEnvironmentCapabilities,
  ExecutionEnvironmentDescriptor,
  ORCHESTRATION_PROTOCOL_HEADER,
  ORCHESTRATION_PROTOCOL_QUERY_PARAM,
  ORCHESTRATION_PROTOCOL_VERSION,
  ORCHESTRATION_PROTOCOL_VERSION_TEXT,
  RepositoryIdentity,
  ThreadEnvMode,
} from "./environment.ts";

const descriptor = {
  environmentId: "environment-1",
  label: "Sample environment",
  platform: { os: "linux", arch: "arm64", machine: "server" },
  serverVersion: "1.2.3",
  capabilities: { repositoryIdentity: true, futureCapability: { enabled: true } },
};

describe("ExecutionEnvironmentDescriptor", () => {
  it("decodes a realistic descriptor and preserves new capabilities", () => {
    expect(ExecutionEnvironmentDescriptor.parse(descriptor)).toMatchObject({
      capabilities: { futureCapability: { enabled: true } },
    });
  });
  it("reads the orchestration protocol version when the host names one", () => {
    expect(
      ExecutionEnvironmentDescriptor.parse(descriptor).orchestrationProtocolVersion,
    ).toBeUndefined();
    expect(
      ExecutionEnvironmentDescriptor.parse({ ...descriptor, orchestrationProtocolVersion: 2 })
        .orchestrationProtocolVersion,
    ).toBe(ORCHESTRATION_PROTOCOL_VERSION);
    expect(ORCHESTRATION_PROTOCOL_VERSION_TEXT).toBe(String(ORCHESTRATION_PROTOCOL_VERSION));
    expect(ORCHESTRATION_PROTOCOL_QUERY_PARAM).toBe("orchestrationProtocol");
    expect(ORCHESTRATION_PROTOCOL_HEADER).toBe("x-t3-orchestration-protocol");
  });
  it("rejects an unknown platform and a missing label", () => {
    expect(
      ExecutionEnvironmentDescriptor.safeParse({
        ...descriptor,
        platform: { os: "plan9", arch: "x64" },
      }).success,
    ).toBe(false);
    expect(ExecutionEnvironmentDescriptor.safeParse({ ...descriptor, label: "" }).success).toBe(
      false,
    );
  });
});

describe("ExecutionEnvironmentCapabilities", () => {
  it("defaults repositoryIdentity and keeps the file attachment limit", () => {
    expect(ExecutionEnvironmentCapabilities.parse({})).toEqual({ repositoryIdentity: false });
    expect(
      ExecutionEnvironmentCapabilities.parse({ fileAttachments: { maxUploadBytes: 1024 } })
        .fileAttachments,
    ).toEqual({ maxUploadBytes: 1024 });
    expect(
      ExecutionEnvironmentCapabilities.safeParse({ fileAttachments: { maxUploadBytes: 0 } })
        .success,
    ).toBe(false);
  });
  it("decodes a server installation and ignores one it cannot read", () => {
    expect(
      ExecutionEnvironmentCapabilities.parse({
        serverInstallation: { kind: "npm-global", prefix: "/opt/sample" },
      }).serverInstallation,
    ).toEqual({ kind: "npm-global", prefix: "/opt/sample" });
    expect(
      ExecutionEnvironmentCapabilities.parse({ serverInstallation: { kind: "future-kind" } })
        .serverInstallation,
    ).toEqual({ kind: "future-kind" });
    expect(
      ExecutionEnvironmentCapabilities.parse({ serverInstallation: "npx" }).serverInstallation,
    ).toBeUndefined();
  });
});

describe("repository identity and thread env mode", () => {
  it("decodes an identity with its locator and origin", () => {
    const identity = {
      canonicalKey: "example/sample",
      locator: {
        source: "git-remote",
        remoteName: "origin",
        remoteUrl: "ssh://example/sample.git",
      },
      origin: { canonicalKey: "example/fork", displayName: "fork" },
    };
    expect(RepositoryIdentity.parse(identity)).toEqual(identity);
    expect(
      RepositoryIdentity.safeParse({ ...identity, locator: { source: "manual" } }).success,
    ).toBe(false);
  });
  it("keeps an unknown env mode as a string", () => {
    expect(ThreadEnvMode.parse("worktree")).toBe("worktree");
    expect(ThreadEnvMode.parse("container")).toBe("container");
  });
});
