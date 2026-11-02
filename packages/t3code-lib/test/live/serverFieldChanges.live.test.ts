// ---
// relationships:
//   verifies: library-wire
// ---
/** The field changes of 0.1.6 outside the orchestration contract, against a real server. */
import * as NodeCP from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { threadId } from "../../src/schemas/common.ts";
import { ComposerContextId } from "../../src/schemas/orchestration/messageContext.ts";
import { TerminalActivityEvent } from "../../src/schemas/terminal.ts";
import {
  connect,
  hasAgent,
  hasLiveServer,
  modelSelection,
  refusal,
  waitFor,
} from "./liveClient.ts";
import { startPeerServer } from "./peerServer.ts";

const ownsServer = hasLiveServer && Boolean(process.env["T3_LIVE_HOME"]);

describe.skipIf(!hasLiveServer)("live server field changes", () => {
  const client = connect();
  afterAll(() => client.close());

  it("reads the descriptor and config flags, without the removed ones", async () => {
    const config = await client.server.getConfig();
    expect(config.environment.databaseMigration).toEqual(expect.any(Number));
    expect(config.environment.capabilities).toMatchObject({
      sideChats: true,
      threadForceStop: true,
    });
    expect(config).toMatchObject({ secretProviderSettings: true, secretReferences: true });
    expect(config).not.toHaveProperty("reasoningMessages");
    for (const provider of config.providers) {
      expect(provider).not.toHaveProperty("requiresNewThreadForModelChange");
    }
  });

  it("reads the terminal grid on the snapshot and after a resize", async () => {
    const cwd = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-grid-"));
    const input = { threadId: NodeCrypto.randomUUID(), terminalId: "term-1", cwd };
    const controller = new AbortController();
    try {
      const events = client.terminal.attach(
        { ...input, cols: 90, rows: 30 },
        { signal: controller.signal },
      );
      const stream = events[Symbol.asyncIterator]();
      const first = await stream.next();
      expect(first.value).toMatchObject({ type: "snapshot", snapshot: { cols: 90, rows: 30 } });
      await client.terminal.resize({ ...input, cols: 100, rows: 40 });
      for (;;) {
        const { value, done } = await stream.next();
        if (done) throw new Error("The terminal stream ended before the resize.");
        const activity = TerminalActivityEvent.safeParse(value);
        if (!activity.success || activity.data.cols === undefined) continue;
        expect(activity.data).toMatchObject({ cols: 100, rows: 40 });
        break;
      }
    } finally {
      controller.abort();
      await client.terminal.close({ ...input, deleteHistory: true }).catch(() => undefined);
      await NodeFSP.rm(cwd, { recursive: true, force: true });
    }
  });

  it("reads config_locked when the Git config is locked", async () => {
    const cwd = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-lock-"));
    const git = (...args: string[]) =>
      NodeCP.execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });
    try {
      git("init", "--initial-branch=main");
      git(
        "-c",
        "user.name=Sample",
        "-c",
        "user.email=sample@example.invalid",
        "commit",
        "--allow-empty",
        "-m",
        "Initial",
      );
      git("remote", "add", "origin", cwd);
      git("update-ref", "refs/remotes/origin/feature", "HEAD");
      await NodeFSP.writeFile(NodePath.join(cwd, ".git", "config.lock"), "");
      const record = await refusal(client.vcs.switchRef({ cwd, refName: "origin/feature" }));
      expect(record).toMatchObject({ _tag: "GitCommandError", reason: "config_locked" });
    } finally {
      await NodeFSP.rm(cwd, { recursive: true, force: true });
    }
  });

  it.skipIf(!hasAgent)(
    "reads an environment context record on a sent message",
    async () => {
      const { projectId } = await client.projects.createNew({ name: "Sample context" });
      const id = threadId(NodeCrypto.randomUUID());
      try {
        const { environment } = await client.server.getConfig();
        const record = {
          version: 1 as const,
          contextId: ComposerContextId.parse("sample-environment"),
          label: "Sample environment",
          kind: "environment" as const,
          environmentId: environment.environmentId,
        };
        await client.threads.create({
          threadId: id,
          projectId,
          title: "Sample context",
          modelSelection,
        });
        await client.threads.startTurn({
          threadId: id,
          text: "Reply with the single word done. Do not use tools.",
          context: { version: 1, records: [record] },
        });
        const message = await waitFor(async () => {
          const projection = await client.threads.projection(id);
          return projection.messages.find((entry) => entry.context !== undefined);
        }, "the message");
        expect(message.context?.records).toEqual([record]);
        await client.threads.stopThread(id);
      } finally {
        await client.threads.delete(id).catch(() => undefined);
        await client.projects.delete(projectId, { force: true }).catch(() => undefined);
      }
    },
    300_000,
  );
});

describe.skipIf(!ownsServer)("live settings field changes", () => {
  it("reads a settings endpoint's source and keeps secret references", async () => {
    const server = await startPeerServer();
    const secret = { provider: "sample", reference: "op://vault/item/field" };
    try {
      await server.client.rpc.callRaw("server.updateSettings", {
        patch: {
          observability: { otlpTracesUrl: "http://127.0.0.1:9/v1/traces" },
          secretProviders: {
            sample: { kind: "one_password", label: "Sample", config: { account: "sample" } },
          },
          providerInstances: {
            sample_codex: {
              driver: "codex",
              environment: [{ name: "SAMPLE_KEY", value: "", sensitive: true, secret }],
            },
          },
        },
      });
      await server.restart(async () => undefined);
      expect((await server.client.server.getConfig()).observability).toMatchObject({
        otlpTracesSource: "settings",
        otlpTracesVariable: null,
      });
      expect(await server.client.server.getSettings()).toMatchObject({
        secretProviders: { sample: { kind: "one_password" } },
        providerInstances: {
          sample_codex: { environment: [{ name: "SAMPLE_KEY", value: "", secret }] },
        },
      });
    } finally {
      await server.stop();
    }
  }, 120_000);
});
