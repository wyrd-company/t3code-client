// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The settings, usage and schedule fields of 0.1.7 against a real server: one-time
 * schedules, hidden thread tags, the usage model filter and secret references in the
 * settings fields that 0.1.7 opens to them. Every task stays disabled, so no run starts.
 */
import { afterAll, describe, expect, it } from "vite-plus/test";
import { usageDay } from "../../src/schemas/usage.ts";
import { connect, hasLiveServer, modelSelection } from "./liveClient.ts";
import { startPeerServer } from "./peerServer.ts";

const ownsServer = hasLiveServer && Boolean(process.env["T3_LIVE_HOME"]);

describe.skipIf(!hasLiveServer)("live 0.1.7 field remainder", () => {
  const client = connect();
  afterAll(() => client.close());

  it("saves, reads and keeps a one-time schedule", async () => {
    const config = await client.server.getConfig();
    expect(config.environment.capabilities).toMatchObject({ oneTimeSchedules: true });
    const { projectId } = await client.projects.ensureScratch();
    const runAt = "2099-01-31T09:30:00+02:00";
    const task = await client.scheduledTasks.upsert({
      title: "Sample once",
      prompt: "Reply with SAMPLE only.",
      enabled: false,
      projectId,
      workspaceStrategy: { type: "root" },
      modelSelection,
      runtimeMode: "approval-required",
      interactionMode: "default",
      schedule: { type: "once", runAt },
      creationSource: "mcp",
    });
    try {
      expect(task.schedule).toMatchObject({ type: "once" });
      const stored = task.schedule as { readonly runAt: string };
      expect(Date.parse(stored.runAt)).toBe(Date.parse(runAt));
      const renamed = await client.scheduledTasks.update(task.id, { title: "Sample once renamed" });
      expect(renamed).toMatchObject({ title: "Sample once renamed", schedule: task.schedule });
    } finally {
      await client.scheduledTasks.delete(task.id);
    }
  });

  it("writes and reads hidden thread tags", async () => {
    try {
      const updated = await client.rpc.call("server.updateSettings", {
        patch: { hiddenThreadTags: ["sample-tag"], hideTaggedThreads: true },
      });
      const read = await client.server.getSettings();
      for (const settings of [updated, read]) {
        expect(settings).toMatchObject({
          hiddenThreadTags: ["sample-tag"],
          hideTaggedThreads: true,
        });
      }
    } finally {
      await client.rpc.call("server.updateSettings", {
        patch: { hiddenThreadTags: [], hideTaggedThreads: false },
      });
    }
  });

  it("sends a usage model filter and reads back the filter the server applied", async () => {
    const day = usageDay("2000-01-01");
    const modelFilter = { exclude: [{ provider: "codex", model: "sample-model" }] };
    const summary = await client.server.usageSummary({
      sinceDay: day,
      untilDay: day,
      timeZone: "Etc/UTC",
      modelFilter,
    });
    expect(summary.modelFilter).toEqual(modelFilter);
    const settings = await client.server.getSettings();
    expect(settings.usageModelFilter).toBeUndefined();
  });
});

describe.skipIf(!ownsServer)("live 0.1.7 secret references", () => {
  it("stores and shows secret references in a management key and an EAS token", async () => {
    const server = await startPeerServer();
    const secret = { provider: "sample", reference: "op://vault/item/field" };
    try {
      await server.client.rpc.call("server.updateSettings", {
        patch: {
          secretProviders: {
            sample: { kind: "one_password", label: "Sample", config: { account: "sample" } },
          },
          usageLimitSources: {
            sample: {
              kind: "cliproxy",
              url: "http://host.invalid:9",
              managementKey: secret,
              enabled: false,
            },
          },
          easDeviceHosts: [{ kind: "eas", id: "sample-eas", label: "Sample", accessToken: secret }],
        },
      });
      expect(await server.client.server.getSettings()).toMatchObject({
        usageLimitSources: { sample: { managementKey: secret } },
        easDeviceHosts: [{ id: "sample-eas", accessToken: secret }],
      });
    } finally {
      await server.stop();
    }
  }, 120_000);
});
