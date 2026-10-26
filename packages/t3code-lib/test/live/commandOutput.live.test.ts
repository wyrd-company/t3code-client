// ---
// relationships:
//   verifies: library-facades
// ---
import * as NodeCP from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { WebSocket as WsWebSocket } from "ws";
import { describe, expect, it } from "vite-plus/test";
import { T3Client, T3DecodeError, T3RpcError, type DecodedStreamItem } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import {
  ProviderInstanceId,
  threadId,
  turnItemId,
  type ProjectId,
  type ThreadId,
  type TurnItemId,
} from "../../src/schemas/common.ts";
import type { OrchestrationV2CommandOutputFrame } from "../../src/schemas/orchestration/commandOutput.ts";

const baseUrl = process.env["T3_LIVE_URL"];
const token = process.env["T3_LIVE_TOKEN"];
const METHOD = "orchestration.subscribeCommandOutput";
/** The pinned server's message for a missing thread or a row that is not a command. */
const NO_SUCH_COMMAND = "No such command.";
/** Run states past preparation: the provider would start, so the stop guard interrupts. */
const PROVIDER_STATES = new Set(["queued", "starting", "running", "waiting"]);

// Counts this method's Request and Interrupt frames; no payload values are kept.
const frames = { requests: 0, interrupts: 0, ids: new Set<string>() };
class CountingSocket extends WsWebSocket {
  override send(data: unknown, ...rest: unknown[]): void {
    try {
      const parsed: unknown = JSON.parse(String(data));
      for (const frame of Array.isArray(parsed) ? parsed : [parsed]) {
        const record = frame as Record<string, unknown>;
        if (record["_tag"] === "Request" && record["tag"] === METHOD) {
          frames.requests += 1;
          frames.ids.add(String(record["id"]));
        }
        if (record["_tag"] === "Interrupt" && frames.ids.has(String(record["requestId"]))) {
          frames.interrupts += 1;
        }
      }
    } catch {
      // Non-JSON frames are not requests.
    }
    (super.send as (...args: unknown[]) => void)(data, ...rest);
  }
}

describe.skipIf(!baseUrl || !token)("live command output", () => {
  it("streams a settled preparation row on both typed paths without provider work", async () => {
    // Literals, booleans, counts and lengths only; no ids, paths or output text.
    const observation: Record<string, unknown> = {};
    const client = T3Client.create({
      baseUrl: baseUrl ?? "",
      accessToken: token ?? "",
      webSocket: CountingSocket as unknown as WebSocketConstructor,
    });
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-command-output-"));
    let projectId: ProjectId | undefined;
    const threadIds: ThreadId[] = [];
    const guard = { tripped: false };
    try {
      const environment = await client.server.environment();
      expect(environment.capabilities.commandOutputStreaming).toBe(true);

      // Both typed paths, normalised to the facade's item shape.
      const paths = (target: { threadId: ThreadId; itemId: TurnItemId }) => [
        () => client.threads.watchCommandOutput(target),
        async function* () {
          for await (const item of client.rpc.stream(METHOD, target)) {
            yield item.kind === "item" ? item.value : item;
          }
        },
      ];
      // Collects until the stream ends by itself; a decode error fails the test.
      const collect = async (
        items: AsyncIterable<DecodedStreamItem<OrchestrationV2CommandOutputFrame>>,
      ) => {
        const out: OrchestrationV2CommandOutputFrame[] = [];
        for await (const item of items) {
          if ("error" in item && item.error instanceof T3DecodeError) throw item.error;
          out.push(item as OrchestrationV2CommandOutputFrame);
        }
        return out;
      };
      const rejections = async (target: { threadId: ThreadId; itemId: TurnItemId }) => {
        const rows = [];
        for (const open of paths(target)) {
          const error = await collect(open()).then(
            () => undefined,
            (caught: unknown) => caught,
          );
          const typed =
            error instanceof T3RpcError && error.is("OrchestrationV2CommandOutputError");
          rows.push({
            class: error instanceof T3RpcError ? "T3RpcError" : typeof error,
            tag: error instanceof T3RpcError ? error.tag : undefined,
            typed,
            noSuchCommand: typed && error.record.message === NO_SUCH_COMMAND,
            threadIdEchoed: typed && error.record.threadId === target.threadId,
          });
        }
        return rows;
      };
      const rejected = {
        class: "T3RpcError",
        tag: "OrchestrationV2CommandOutputError",
        typed: true,
        noSuchCommand: true,
        threadIdEchoed: true,
      };

      observation["missingThread"] = await rejections({
        threadId: threadId(NodeCrypto.randomUUID()),
        itemId: turnItemId(NodeCrypto.randomUUID()),
      });
      expect(observation["missingThread"]).toEqual([rejected, rejected]);

      // A generic one-commit repository; the launch asks for a worktree from a ref that does not
      // exist, so the server settles its own preparation command row before any provider turn.
      const git = (...args: string[]) =>
        NodeCP.execFileSync(
          "git",
          [
            "-C",
            root,
            "-c",
            "user.name=Sample",
            "-c",
            "user.email=sample@example.invalid",
            ...args,
          ],
          { stdio: "pipe" },
        );
      git("init", "--initial-branch=main");
      await NodeFSP.writeFile(NodePath.join(root, "sample.txt"), "sample\n");
      git("add", "sample.txt");
      git("commit", "-m", "Sample commit");
      projectId = (await client.projects.create({ workspaceRoot: root, title: "Sample output" }))
        .id;
      const launched = await client.threads.launch({
        projectId,
        title: "Sample output",
        modelSelection: { instanceId: ProviderInstanceId.parse("codex"), model: "gpt-6-luna" },
        workspace: {
          type: "worktree",
          baseRef: "sample-missing-base-ref",
          branch: "sample-output",
        },
        initialMessage: { text: "Sample message" },
      });
      const id = launched.threadId;
      threadIds.push(id);
      const read = async () => {
        const projection = await client.threads.projection(id);
        const run = projection.runs.at(-1);
        if (
          !guard.tripped &&
          ((run !== undefined && PROVIDER_STATES.has(String(run.status))) ||
            projection.providerTurns.length > 0)
        ) {
          guard.tripped = true;
          await client.threads.interrupt(id, run?.id);
        }
        const row = projection.turnItems.find(
          (item) => item.type === "command_execution" && item.runId === run?.id,
        );
        return { projection, run, row };
      };
      await expect
        .poll(async () => {
          const { run, row } = await read();
          return `${String(run?.status)}/${String(row?.status)}`;
        })
        .toBe("failed/failed");
      const settled = await read();
      expect(guard.tripped).toBe(false);
      expect(settled.projection.providerTurns).toHaveLength(0);
      const row = settled.row;
      const userRow = settled.projection.turnItems.find((item) => item.type === "user_message");
      if (row === undefined || userRow === undefined) throw new Error("expected rows are absent");

      const before = { ...frames };
      const streamed = [];
      for (const open of paths({ threadId: id, itemId: row.id }))
        streamed.push(await collect(open()));
      observation["settled"] = streamed.map((items) =>
        items.map((frame) => ({
          keys: Object.keys(frame).sort(),
          kind: frame.kind,
          running: frame.running,
          truncated: frame.truncated,
          textType: typeof frame.text,
          textLength: frame.text.length,
        })),
      );
      for (const items of streamed) {
        expect(items).toHaveLength(1);
        const [frame] = items;
        expect(Object.keys(frame!).sort()).toEqual(["kind", "running", "text", "truncated"]);
        expect(frame!.kind).toBe("replace");
        expect(frame!.running).toBe(false);
        expect(typeof frame!.truncated).toBe("boolean");
        expect(typeof frame!.text).toBe("string");
      }
      observation["settledFrames"] = {
        requests: frames.requests - before.requests,
        interrupts: frames.interrupts - before.interrupts,
      };
      expect(observation["settledFrames"]).toEqual({ requests: 2, interrupts: 0 });

      observation["missingRow"] = await rejections({
        threadId: id,
        itemId: turnItemId(NodeCrypto.randomUUID()),
      });
      expect(observation["missingRow"]).toEqual([rejected, rejected]);
      observation["wrongRowType"] = await rejections({ threadId: id, itemId: userRow.id });
      expect(observation["wrongRowType"]).toEqual([rejected, rejected]);
      observation["after"] = {
        runStatus: String((await read()).run?.status),
        providerTurns: (await read()).projection.providerTurns.length,
      };
      expect(observation["after"]).toEqual({ runStatus: "failed", providerTurns: 0 });
    } finally {
      observation["stopGuardTripped"] = guard.tripped;
      try {
        for (const id of threadIds) await client.threads.delete(id);
        if (projectId !== undefined) await client.projects.delete(projectId, { force: true });
        observation["ownedCleanup"] = "complete";
      } finally {
        await client.close();
        await NodeFSP.rm(root, { recursive: true, force: true });
        const evidence = process.env["T3_LIVE_COMMAND_OUTPUT_EVIDENCE"];
        if (evidence)
          await NodeFSP.writeFile(evidence, `${JSON.stringify(observation, null, 2)}\n`);
      }
    }
  });
});
