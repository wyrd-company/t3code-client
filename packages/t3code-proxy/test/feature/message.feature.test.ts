// ---
// relationships:
//   verifies: proxy
// ---
import { T3Client, providerInstanceId, type ThreadId } from "@wyrd-company/t3code-lib";
import { WebSocket } from "ws";
import { expect, it } from "vite-plus/test";

const accessToken = process.env["T3_FEATURE_TOKEN"]!;
const client = (host: string) =>
  T3Client.create({
    baseUrl: `https://${host}.dev.example.test`,
    accessToken,
    webSocket: WebSocket as never,
  });

it("stores the byline of the person's hostname, and none on the server's hostname", async () => {
  const direct = client("t3");
  const alice = client("t3-alice");
  const sam = client("t3-sam");
  try {
    const project = await direct.projects.ensure({
      workspaceRoot: "/tmp/sample-project",
      title: "Sample",
    });
    const send = async (sender: T3Client, text: string): Promise<ThreadId> => {
      const thread = await sender.threads.create({
        projectId: project.id,
        title: "Sample",
        modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
      });
      await sender.threads.startTurn({ threadId: thread.id, text, delivery: "queue" });
      return thread.id;
    };
    const stored = (thread: ThreadId) => async () =>
      JSON.stringify(await direct.threads.transcript(thread));

    await expect
      .poll(stored(await send(alice, "Sample one.")), { timeout: 60_000 })
      .toContain(JSON.stringify("Sample one.\n\n— Sent by Alice"));
    await expect
      .poll(stored(await send(sam, "Sample two.")), { timeout: 60_000 })
      .toContain(JSON.stringify("Sample two.\n\n— Sent by Sam"));
    await expect
      .poll(stored(await send(direct, "Sample three.")), { timeout: 60_000 })
      .toContain(JSON.stringify("Sample three."));
  } finally {
    await Promise.all([direct.close(), alice.close(), sam.close()]);
  }
});
