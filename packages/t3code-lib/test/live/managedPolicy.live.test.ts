// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * Managed policy on the stock server. A release build reads its policy only from the
 * machine-wide path, which is outside the isolated home and is shared with other servers on
 * the machine, so the harness runs without a policy. The server then sends no policy fields.
 */
import { describe, expect, it } from "vite-plus/test";
import { connect, hasLiveServer, modelSelection } from "./liveClient.ts";

describe.skipIf(!hasLiveServer)("live managed policy", () => {
  it("sends no policy summary and no policy block without a policy file", async () => {
    const client = connect();
    let taskId: Parameters<typeof client.scheduledTasks.delete>[0] | undefined;
    try {
      const config = await client.server.getConfig();
      expect(config).not.toHaveProperty("managedPolicy");

      const { projectId } = await client.projects.ensureScratch();
      const task = await client.scheduledTasks.upsert({
        title: "Sample policy webhook",
        prompt: "Reply with SAMPLE only.",
        enabled: false,
        projectId,
        workspaceStrategy: { type: "root" },
        modelSelection,
        runtimeMode: "approval-required",
        interactionMode: "default",
        schedule: { type: "webhook" },
        creationSource: "mcp",
      });
      taskId = task.id;
      expect(task).not.toHaveProperty("blockedByPolicy");
      expect(await client.scheduledTasks.get(task.id)).not.toHaveProperty("blockedByPolicy");
    } finally {
      try {
        if (taskId) await client.scheduledTasks.delete(taskId);
      } finally {
        await client.close();
      }
    }
  });
});
