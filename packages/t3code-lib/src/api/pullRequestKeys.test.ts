import { describe, expect, it } from "vite-plus/test";

import { ids } from "../../test/support/threadFixtures.ts";
import type { ThreadPullRequestLink } from "../schemas/orchestration/pullRequest.ts";
import { pullRequestKeysEqual, threadPullRequestsOf } from "./pullRequestKeys.ts";

const key = (host: string, repository: string, url?: string) => ({
  host,
  repository,
  number: 7,
  ...(url === undefined ? {} : { url }),
});

describe("pullRequestKeysEqual", () => {
  it("compares host and repository case-insensitively", () => {
    expect(
      pullRequestKeysEqual(
        key("Git.Example.Test", "Sample/Repo"),
        key("git.example.test", "sample/repo"),
      ),
    ).toBe(true);
    expect(
      pullRequestKeysEqual(
        key("git.example.test", "sample/repo"),
        key("git.example.test", "sample/other"),
      ),
    ).toBe(false);
  });

  it("keeps the port a Forgejo link's URL names", () => {
    const withPort = key(
      "forge.example.test",
      "sample/repo",
      "http://forge.example.test:3000/sample/repo/pulls/7",
    );
    const otherPort = key(
      "forge.example.test",
      "sample/repo",
      "http://forge.example.test:3001/sample/repo/pulls/7",
    );
    expect(pullRequestKeysEqual(withPort, withPort)).toBe(true);
    expect(pullRequestKeysEqual(withPort, otherPort)).toBe(false);
    expect(pullRequestKeysEqual(withPort, key("forge.example.test", "sample/repo"))).toBe(false);
  });

  it("folds Azure DevOps hosts to one form", () => {
    expect(
      pullRequestKeysEqual(
        key("sample.visualstudio.com", "project/_git/repo"),
        key("dev.azure.com", "sample/project/_git/repo"),
      ),
    ).toBe(true);
  });
});

describe("threadPullRequestsOf", () => {
  const link = {
    host: "git.example.test",
    repository: "sample/repo",
    number: 7,
  } as ThreadPullRequestLink;

  it("prefers pullRequests, even when empty", () => {
    expect(threadPullRequestsOf({ pullRequests: [link] })).toEqual([link]);
    expect(
      threadPullRequestsOf({
        pullRequests: [],
        linkedPullRequest: {
          projectId: ids.projectId,
          repository: "sample/repo",
          number: 7,
          url: "https://git.example.test/sample/repo/pull/7",
        },
      }),
    ).toEqual([]);
  });

  it("builds one link from the legacy linked pull request", () => {
    const [legacy, ...rest] = threadPullRequestsOf({
      linkedPullRequest: {
        projectId: ids.projectId,
        repository: "Sample/Repo",
        number: 7,
        url: "https://git.example.test/sample/repo/pull/7",
      },
    });
    expect(rest).toEqual([]);
    expect(legacy).toMatchObject({
      host: "git.example.test",
      repository: "sample/repo",
      number: 7,
      source: "manual",
      snapshot: null,
      stack: null,
    });
  });

  it("recovers the Azure DevOps organization and project from the URL", () => {
    const [legacy] = threadPullRequestsOf({
      linkedPullRequest: {
        projectId: ids.projectId,
        repository: "repo",
        number: 7,
        url: "https://dev.azure.com/sample/project/_git/repo/pullrequest/7",
      },
    });
    expect(legacy).toMatchObject({ host: "dev.azure.com", repository: "sample/project/_git/repo" });
  });

  it("is empty without any link", () => {
    expect(threadPullRequestsOf({})).toEqual([]);
    expect(threadPullRequestsOf({ linkedPullRequest: null })).toEqual([]);
  });
});
