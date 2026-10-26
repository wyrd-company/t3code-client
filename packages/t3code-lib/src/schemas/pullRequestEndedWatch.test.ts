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
import { ThreadPullRequestLink, type ThreadPullRequestWatch } from "./orchestration/pullRequest.ts";
import { OrchestrationV2ThreadProjection } from "./orchestration/projection.ts";
import { OrchestrationV2ThreadStreamItem } from "./orchestration/stream.ts";

const watch = {
  startedAt: at,
  headSha: null,
  failedChecks: [],
  passed: false,
  passedChecks: [],
  remarksThrough: at,
  remarkIds: [],
  conflicting: false,
  wakes: 0,
};

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

describe("optional ended-watch metadata on thread pull request links", () => {
  it("exposes optional watch record through linked records and public thread reads", () => {
    type Projection = Awaited<ReturnType<ThreadsApi["projection"]>>;
    expectTypeOf<ThreadPullRequestLink["endedWatch"]>().toEqualTypeOf<
      ThreadPullRequestWatch | undefined
    >();
    expectTypeOf<
      NonNullable<Projection["thread"]["pullRequests"]>[number]["endedWatch"]
    >().toEqualTypeOf<ThreadPullRequestWatch | undefined>();
  });

  it("preserves watch records, omission and unknown metadata across containing schemas", () => {
    for (const metadata of [
      {},
      { endedWatch: watch },
      {
        endedWatch: {
          ...watch,
          headSha: "sample-head",
          failedChecks: ["sample-check"],
          passed: true,
          passedChecks: ["sample-other"],
          remarkIds: ["sample-remark"],
          conflicting: true,
          wakes: 2,
          futureWatch: "preserved",
        },
      },
    ]) {
      const value = link({ ...metadata, future: "preserved" });
      const decoded = ThreadPullRequestLink.parse(value);
      expect(decoded).toEqual(value);
      expect(Object.hasOwn(decoded, "endedWatch")).toBe(Object.hasOwn(metadata, "endedWatch"));
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

  it("uses the existing passed-checks decoding default inside ended watches", () => {
    const { passedChecks: _omitted, ...olderWatch } = watch;
    const value = link({ endedWatch: olderWatch });
    expect(ThreadPullRequestLink.parse(value).endedWatch?.passedChecks).toEqual([]);
    expect(
      OrchestrationV2ThreadStreamItem.parse(
        eventItem(1, "thread.pull-request-link-updated", value),
      ),
    ).toMatchObject({ kind: "event", event: { payload: { endedWatch: watch } } });
  });

  it("rejects malformed ended-watch metadata on an otherwise valid link", () => {
    expect(ThreadPullRequestLink.safeParse(link()).success).toBe(true);
    for (const endedWatch of [
      null,
      "sample",
      false,
      0,
      [],
      {},
      { ...watch, passed: "invalid" },
      { ...watch, headSha: 1 },
      { ...watch, wakes: -1 },
      { ...watch, startedAt: 1 },
      { ...watch, failedChecks: [1] },
      { ...watch, remarkIds: [null] },
      { ...watch, conflicting: null },
      { ...watch, passedChecks: false },
    ]) {
      const value = link({ endedWatch });
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
