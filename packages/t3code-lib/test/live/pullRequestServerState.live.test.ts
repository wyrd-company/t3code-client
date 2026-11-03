// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The pull request writes that stay on an owned stock server with its own `HOME`: viewed
 * files, cached reads, a reported state and review guides. A local `glab` stub is the forge.
 * Without `T3_LIVE_AGENT=1`, a review guide run fails for lack of a provider credential.
 */
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import type { T3Client } from "../../src/index.ts";
import { projectId } from "../../src/schemas/common.ts";
import {
  firstItem,
  hasAgent,
  hasLiveServer,
  modelSelection,
  refusal,
  waitFor,
} from "./liveClient.ts";
import { repository, startPullRequestServer, type PullRequestServer } from "./pullRequestForge.ts";

describe.skipIf(!hasLiveServer)("pull request state on the server", () => {
  let peer: PullRequestServer;
  let client: T3Client;
  const project = projectId(`project-${crypto.randomUUID()}`);
  const ref = { projectId: project, repository, number: 7 };

  beforeAll(async () => {
    peer = await startPullRequestServer(project);
    client = peer.client;
  });

  afterAll(() => peer?.stop());

  it("keeps viewed files on the server for a host without them", async () => {
    await client.rpc.call("pullRequests.setFilesViewed", {
      ...ref,
      files: [{ path: "sample.txt", viewed: true }],
    });
    await expect(client.rpc.call("pullRequests.filesViewed", ref)).resolves.toEqual({
      files: [{ path: "sample.txt", state: "viewed" }],
      truncated: false,
    });
    await client.rpc.call("pullRequests.setFilesViewed", {
      ...ref,
      files: [{ path: "sample.txt", viewed: false }],
    });
    await expect(client.rpc.call("pullRequests.filesViewed", ref)).resolves.toEqual({
      files: [],
      truncated: false,
    });
    await expect(peer.takeForgeCalls()).resolves.toEqual([]);
  });

  it("drops cached reads and reports a new revision", async () => {
    const title = async () => (await client.rpc.call("pullRequests.detail", ref)).title;
    await client.rpc.call("pullRequests.invalidate", { reference: ref });
    await expect(title()).resolves.toBe("Sample change");
    await peer.setForgeTitle("Sample new title");
    await expect(title()).resolves.toBe("Sample change");
    const first = firstItem(client.rpc.stream("pullRequests.subscribeRefreshes", {}), (value) =>
      value > 0 ? value : undefined,
    );
    await client.rpc.call("pullRequests.invalidate", { reference: ref, filesViewedOnly: true });
    const before = await first;
    await expect(title()).resolves.toBe("Sample change");
    const after = firstItem(client.rpc.stream("pullRequests.subscribeRefreshes", {}), (value) =>
      value > before ? value : undefined,
    );
    await client.rpc.call("pullRequests.invalidate", { reference: ref });
    await expect(after).resolves.toBeGreaterThan(before);
    await expect(title()).resolves.toBe("Sample new title");
    await peer.setForgeTitle("Sample change");
    await client.rpc.call("pullRequests.invalidate", { reference: ref });
    await expect(title()).resolves.toBe("Sample change");
  });

  it("drops cached listings without a reference", async () => {
    const listedTitle = async () =>
      (await client.rpc.call("pullRequests.list", { state: "open" })).entries[0]?.title;
    await client.rpc.call("pullRequests.invalidate", {});
    await expect(listedTitle()).resolves.toBe("Sample change");
    await peer.setForgeTitle("Sample new title");
    await expect(listedTitle()).resolves.toBe("Sample change");
    await client.rpc.call("pullRequests.invalidate", {});
    await expect(listedTitle()).resolves.toBe("Sample new title");
    await peer.setForgeTitle("Sample change");
    await client.rpc.call("pullRequests.invalidate", {});
  });

  it("takes a client's report of the state", async () => {
    await expect(
      client.rpc.call("pullRequests.reportState", {
        reference: ref,
        state: "merged",
        isDraft: false,
      }),
    ).resolves.toBeUndefined();
  });

  describe("the review guide", () => {
    it("refuses while review guides are off", async () => {
      await expect(
        refusal(client.rpc.call("pullRequests.generateReviewGuide", ref)),
      ).resolves.toMatchObject({
        _tag: "PullRequestOperationError",
        operation: "generateReviewGuide",
      });
    });

    it(
      hasAgent ? "stores the guide that a model writes" : "reports a run that cannot finish",
      async () => {
        await client.rpc.call("server.updateSettings", {
          patch: { reviewGuidesEnabled: true, reviewGuideModelSelection: modelSelection },
        });
        const started = await client.rpc.call("pullRequests.generateReviewGuide", ref);
        expect(started).toMatchObject({
          guide: null,
          run: { _tag: "Running", headSha: peer.headSha },
          currentHeadSha: peer.headSha,
        });
        const ended = await waitFor(
          async () => {
            const read = await client.rpc.call("pullRequests.reviewGuide", ref);
            return read.run !== null && !("unknown" in read.run) && read.run._tag === "Running"
              ? undefined
              : read;
          },
          "the review guide run to end",
          { timeoutMs: 240_000 },
        );
        if (hasAgent) {
          expect(ended.run).toBeNull();
          expect(ended.guide).toMatchObject({ headSha: peer.headSha, modelSelection });
          expect(ended.guide?.stops.length).toBeGreaterThan(0);
        } else {
          expect(ended.guide).toBeNull();
          expect(ended.run).toMatchObject({ _tag: "Failed", headSha: peer.headSha });
        }
      },
      300_000,
    );
  });
});
