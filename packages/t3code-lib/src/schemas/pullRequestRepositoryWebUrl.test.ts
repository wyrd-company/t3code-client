// ---
// relationships:
//   verifies: library-wire
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import {
  at,
  eventItem,
  makeAppThread,
  makeProjection,
  makeShellThread,
} from "../../test/support/threadFixtures.ts";
import type { ThreadsApi } from "../api/threads.ts";
import { ThreadPullRequestLink } from "./orchestration/pullRequest.ts";
import { OrchestrationV2ThreadProjection } from "./orchestration/projection.ts";
import { OrchestrationV2ThreadStreamItem } from "./orchestration/stream.ts";

const link = (metadata: Record<string, unknown> = {}) => ({
  host: "example.invalid",
  repository: "sample/repository",
  number: 1,
  url: "https://example.invalid/sample/repository/pull/1",
  source: "manual",
  linkedAt: at,
  snapshot: null,
  stack: null,
  ...metadata,
});

describe("optional repository URL metadata on thread pull request links", () => {
  it("exposes optional string through linked records and public thread reads", () => {
    type Projection = Awaited<ReturnType<ThreadsApi["projection"]>>;
    expectTypeOf<ThreadPullRequestLink["repositoryWebUrl"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<
      NonNullable<Projection["thread"]["pullRequests"]>[number]["repositoryWebUrl"]
    >().toEqualTypeOf<string | undefined>();
  });

  it("preserves nonempty strings, omission and unknown metadata across containing schemas", () => {
    for (const metadata of [
      {},
      { repositoryWebUrl: "https://example.invalid/sample/repository" },
      { repositoryWebUrl: "ssh://git@example.invalid/sample/repository.git" },
      { repositoryWebUrl: "sample" },
    ]) {
      const value = link({ ...metadata, future: "preserved" });
      const decoded = ThreadPullRequestLink.parse(value);
      expect(decoded).toEqual(value);
      expect(Object.hasOwn(decoded, "repositoryWebUrl")).toBe(
        Object.hasOwn(metadata, "repositoryWebUrl"),
      );
      expect(
        makeProjection({ thread: makeAppThread({ pullRequests: [value] }) }).thread
          .pullRequests?.[0],
      ).toEqual(value);
      expect(makeShellThread({ pullRequests: [value] }).pullRequests?.[0]).toEqual(value);
      expect(
        OrchestrationV2ThreadStreamItem.parse(
          eventItem(1, "thread.pull-request-link-updated", value),
        ),
      ).toMatchObject({ kind: "event", event: { payload: value } });
    }
  });

  it("rejects malformed repository URL metadata on an otherwise valid link", () => {
    expect(ThreadPullRequestLink.safeParse(link()).success).toBe(true);
    for (const repositoryWebUrl of [null, "", " \t ", false, 0, [], {}]) {
      const value = link({ repositoryWebUrl });
      expect(ThreadPullRequestLink.safeParse(value).success).toBe(false);
      expect(
        OrchestrationV2ThreadProjection.safeParse({
          ...makeProjection(),
          thread: makeAppThread({ pullRequests: [value] }),
        }).success,
      ).toBe(false);
      expect(
        OrchestrationV2ThreadStreamItem.safeParse(
          eventItem(1, "thread.pull-request-link-updated", value),
        ).success,
      ).toBe(false);
    }
  });
});
