// ---
// relationships:
//   verifies: library-wire
// ---
import { afterAll, describe, expect, it } from "vite-plus/test";
import { schemas } from "../../src/index.ts";
import { connect, hasLiveServer, modelSelection } from "./liveClient.ts";

describe.skipIf(!hasLiveServer)("stock issue tracker RPCs", () => {
  const client = connect();
  afterAll(() => client.close());

  it("reads the issue index and standalone tracker connections", async () => {
    expect(await client.server.environment()).toMatchObject({
      capabilities: { issues: true, issueLinkedThreads: true },
    });
    expect(await client.rpc.call("issues.list", { state: "all" })).toMatchObject({
      entries: expect.any(Array),
      trackers: expect.any(Array),
      nextCursors: expect.any(Object),
    });
    expect(await client.rpc.call("issueTrackers.list", {})).toMatchObject({
      trackers: expect.any(Array),
      bindings: expect.any(Object),
    });
  });

  it("links and unlinks an issue through the thread projection", async () => {
    const { projectId } = await client.projects.ensureScratch();
    const { id: threadId } = await client.threads.create({
      projectId,
      title: "Sample issue thread",
      modelSelection,
    });
    const issue = schemas.issues.ThreadIssueKey.parse({
      tracker: "github",
      host: "github.com",
      scope: "sample/repository",
      key: "123",
    });
    const stamp = () => ({ threadId, commandId: client.threads.dispatcher.newCommandId() });

    try {
      await client.threads.dispatch({
        type: "thread.issue.link",
        ...stamp(),
        ...issue,
        projectId,
        url: "https://github.com/sample/repository/issues/123",
        displayKey: "#123",
        title: "Sample issue",
        source: "manual",
      });
      expect((await client.threads.projection(threadId)).thread.issues).toMatchObject([issue]);
      expect(await client.rpc.call("issues.linkedThreads", issue)).toMatchObject({
        threads: [{ id: threadId, projectId }],
      });

      await client.threads.dispatch({ type: "thread.issue.unlink", ...stamp(), ...issue });
      expect(await client.rpc.call("issues.linkedThreads", issue)).toEqual({ threads: [] });
    } finally {
      await client.threads.delete(threadId);
    }
  });
});
