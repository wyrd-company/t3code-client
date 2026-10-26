// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { ids } from "../../test/support/threadFixtures.ts";
import { OrchestrationV2Command } from "./orchestration/commands.ts";
import { ThreadPullRequestWatchCommand } from "./orchestration/commands/pullRequest.ts";

const command = (metadata: Record<string, unknown> = {}) => ({
  type: "thread.pull-request.watch",
  commandId: "command-1",
  threadId: ids.threadId,
  host: "example.invalid",
  repository: "sample/repository",
  number: 1,
  watching: true,
  link: {
    url: "https://example.invalid/sample/repository/pull/1",
    source: "manual",
    ...metadata,
  },
});

describe("nested watch pull request link command repository URL metadata", () => {
  it("exposes optional string on the nested watch command and public command union", () => {
    type Command = Extract<OrchestrationV2Command, { type: "thread.pull-request.watch" }>;
    expectTypeOf<NonNullable<Command["link"]>["repositoryWebUrl"]>().toEqualTypeOf<
      string | undefined
    >();
  });

  it("preserves nonempty strings, omission and unknown command metadata", () => {
    for (const metadata of [
      {},
      { repositoryWebUrl: "https://example.invalid/sample/repository" },
      { repositoryWebUrl: "ssh://git@example.invalid/sample/repository.git" },
      { repositoryWebUrl: "sample" },
    ]) {
      const value = command({ ...metadata, future: "preserved" });
      for (const schema of [ThreadPullRequestWatchCommand, OrchestrationV2Command]) {
        const decoded = schema.parse(value);
        expect(decoded).toEqual(value);
        expect(Object.hasOwn(decoded["link"] as object, "repositoryWebUrl")).toBe(
          Object.hasOwn(metadata, "repositoryWebUrl"),
        );
      }
    }
  });

  it("rejects malformed metadata on an otherwise valid nested watch command", () => {
    expect(ThreadPullRequestWatchCommand.safeParse(command()).success).toBe(true);
    expect(OrchestrationV2Command.safeParse(command()).success).toBe(true);
    for (const repositoryWebUrl of [null, "", " \t ", false, 0, [], {}]) {
      const value = command({ repositoryWebUrl });
      expect(ThreadPullRequestWatchCommand.safeParse(value).success).toBe(false);
      expect(OrchestrationV2Command.safeParse(value).success).toBe(false);
    }
  });
});
