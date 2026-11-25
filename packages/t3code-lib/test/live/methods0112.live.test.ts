// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The 0.1.12 methods and routes that a fresh isolated stock server can answer without an agent:
 * workflow reads and definition files, linked environment names and thread reads, MCP sign-in
 * and feedback refusals, MCP OAuth revocation, the scope rules the server checks itself, and
 * the socket heartbeat.
 */
import { afterAll, describe, expect, it } from "vite-plus/test";
import { WebSocket as WsWebSocket } from "ws";
import { T3AuthError, T3Client, T3RpcError } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import {
  EnvironmentId,
  isUnknownVariant,
  threadId,
  turnItemId,
  type ProjectId,
} from "../../src/schemas/common.ts";
import { connect, connectWithScopes, firstItem, hasLiveServer, refusal } from "./liveClient.ts";

const ownsServer = Boolean(process.env["T3_LIVE_HOME"]);
/** The smallest workflow upstream's own tests define: it returns a string and has no trigger. */
const sampleWorkflow = `const { workflow } = T3;
workflow("sample0112", { version: 1, payload: Schema.Struct({}), returns: Schema.String }, () =>
  Effect.succeed("sample"),
);
`;
const environmentId = EnvironmentId.parse("environment-missing");
const missingLink = { environmentId, threadId: threadId("thread-missing") };

/** A refusal that the server raised because the session lacks `scope`. */
async function serverScopeRefusal(promise: Promise<unknown>, scope: string): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(error).toBeInstanceOf(T3RpcError);
  if (!(error instanceof T3RpcError)) return;
  expect(error.tag).toBe("EnvironmentAuthorizationError");
  expect(JSON.stringify(error.record)).toContain(scope);
}

describe.skipIf(!hasLiveServer)("live 0.1.12 methods", () => {
  const client = connect();
  const scoped: T3Client[] = [];
  afterAll(async () => {
    for (const other of scoped) await other.close();
    await client.close();
  });

  it("reads workflow lists, counts and a missing run with the beta off", async () => {
    const counts = await firstItem(client.rpc.stream("workflows.counts", {}), (value) => value);
    expect(counts).toEqual({ needsYou: 0, active: 0, total: 0 });
    const list = await firstItem(
      client.rpc.stream("workflows.subscribe", { changes: true }),
      (value) => value,
    );
    expect(list).toMatchObject({ runs: [], questions: [] });
    const missing = await refusal(client.rpc.call("workflows.get", { runId: "run-missing" }));
    expect(isUnknownVariant<"_tag">(missing)).toBe(false);
    expect(missing).toMatchObject({ _tag: "WorkflowRequestError", message: expect.any(String) });
  });

  it.skipIf(!ownsServer)("saves, lists and deletes a workflow definition file", async () => {
    const name = "sample-0112.ts";
    const off = await client.rpc.call("workflows.saveDefinition", { name, source: sampleWorkflow });
    expect(off).toMatchObject({ changed: false, problems: [{ message: expect.any(String) }] });
    // The beta is off by default. The sample has no trigger, so nothing runs it.
    await client.rpc.call("server.updateSettings", { patch: { workflowsEnabled: true } });
    try {
      const broken = await client.rpc.call("workflows.saveDefinition", {
        name,
        source: "T3.workflow(\n  'x',\n];\n",
      });
      expect(broken.changed).toBe(false);
      expect(broken.problems[0]).toMatchObject({ file: name, line: 3 });
      const saved = await client.rpc.call("workflows.saveDefinition", {
        name,
        source: sampleWorkflow,
      });
      expect(saved).toEqual({ changed: true, problems: [] });
      const files = await client.rpc.call("workflows.getDefinition", {});
      expect(files.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name, source: sampleWorkflow, workflows: ["sample0112@1"] }),
        ]),
      );
      const removed = await client.rpc.call("workflows.deleteDefinition", { name });
      expect(removed.changed).toBe(true);
    } finally {
      await client.rpc.call("workflows.deleteDefinition", { name }).catch(() => undefined);
      await client.rpc.call("server.updateSettings", { patch: { workflowsEnabled: false } });
    }
    const reader = await connectWithScopes(client, ["orchestration:read", "filesystem:read"]);
    scoped.push(reader);
    await expect(
      reader.rpc.call("workflows.saveDefinition", { name, source: "" }),
    ).rejects.toMatchObject({ code: "insufficient_scope", requiredScope: "terminal:operate" });
  });

  it("names no links and refuses a linked thread while linked environments are off", async () => {
    expect(await client.rpc.call("peerLinks.names", {})).toEqual({ links: [] });
    for (const read of [
      client.rpc.call("peerLinks.threadHistoryPage", { ...missingLink, cursor: "cursor-1" }),
      client.rpc.call("peerLinks.threadItem", {
        ...missingLink,
        itemId: turnItemId("item-missing"),
      }),
    ]) {
      const record = await refusal(read);
      expect(record).toMatchObject({ _tag: "PeerLinkThreadReadError" });
      expect(["disabled", "unknown_link"]).toContain((record as { reason: string }).reason);
    }
    const pairing = await refusal(client.rpc.call("peerLinks.pairClient", { environmentId }));
    expect(isUnknownVariant<"_tag">(pairing)).toBe(false);
  });

  it("refuses an MCP sign-in and a feedback answer for a thread that has neither", async () => {
    const project = await client.projects.createNew({ name: "Sample 0.1.12 refusals" });
    const projectId: ProjectId = project.projectId;
    try {
      const thread = await client.threads.create({
        projectId,
        title: "Sample refusals",
        modelSelection: { instanceId: "codex" as never, model: "gpt-6-luna" },
      });
      const signIn = await refusal(
        client.rpc.call("provider.mcpSignIn.start", {
          threadId: thread.id,
          providerThreadId: "provider-thread-missing" as never,
          server: "sample",
        }),
      );
      expect(isUnknownVariant<"_tag">(signIn)).toBe(false);
      const feedback = await refusal(
        client.rpc.call("agentFeedback.answerRequest", {
          threadId: thread.id,
          turnItemId: "item-missing" as never,
          answer: "decline",
        }),
      );
      expect(feedback).toMatchObject({ _tag: "AgentFeedbackRequestError" });
      await client.threads.delete(thread.id);
    } finally {
      await client.projects.delete(projectId, { force: true }).catch(() => undefined);
    }
  });

  it("advertises MCP OAuth revocation and answers it for an unknown token", async () => {
    const metadata = await client.routes.call("mcpOAuth.authorizationServer", undefined);
    expect(metadata.revocation_endpoint).toMatch(/\/oauth\/mcp\/revoke$/);
    await expect(
      client.routes.call("mcpOAuth.revoke", { body: { token: "sample-unknown-token" } }),
    ).resolves.toBeUndefined();
    await expect(client.routes.call("mcpOAuth.revoke", { body: {} })).resolves.toBeUndefined();
  });

  it("checks on the server the scope rules 0.1.12 adds to older methods", async () => {
    const operator = await connectWithScopes(client, [
      "orchestration:read",
      "orchestration:operate",
    ]);
    const settingsWriter = await connectWithScopes(client, ["settings:write"]);
    const linkWriter = await connectWithScopes(client, ["access:write"]);
    scoped.push(operator, settingsWriter, linkWriter);
    await serverScopeRefusal(
      operator.rpc.call("secrets.answerRequest", {
        threadId: "thread-missing" as never,
        turnItemId: "item-missing" as never,
        answer: { type: "reference", reference: { provider: "sample", reference: "sample/key" } },
      }),
      "providers:manage",
    );
    await serverScopeRefusal(
      settingsWriter.rpc.call("server.updateSettings", { patch: { defaultProjectScripts: [] } }),
      "orchestration:operate",
    );
    await serverScopeRefusal(
      linkWriter.rpc.call("guestShare.create", { threadId: "thread-missing" as never }),
      "orchestration:read",
    );
    // A cloud speech key that is a secret reference: no provider login is needed to be refused.
    const voice = await settingsWriter.routes
      .call("voice.setCloudKey", {
        params: { provider: "openai" },
        body: { key: { provider: "sample", reference: "sample/key" } },
      })
      .catch((error: unknown) => error);
    expect(voice).toBeInstanceOf(T3AuthError);
    // `method` is the request's, not "LOCAL": the server refused it.
    expect(voice).toMatchObject({ status: 403, method: "POST", requiredScope: "providers:manage" });
  });

  it("keeps a socket that hears only the server's heartbeat", async () => {
    let pongs = 0;
    class CountingWebSocket extends WsWebSocket {
      constructor(...args: ConstructorParameters<typeof WsWebSocket>) {
        super(...args);
        this.on("message", (data) => {
          if (String(data).includes('"_tag":"Pong"')) pongs += 1;
        });
      }
    }
    const quiet = T3Client.create({
      baseUrl: process.env["T3_LIVE_URL"] ?? "",
      accessToken: process.env["T3_LIVE_TOKEN"] ?? "",
      webSocket: CountingWebSocket as unknown as WebSocketConstructor,
      // No Ping of ours in the window, so a Pong is the server's own heartbeat.
      pingIntervalMs: 120_000,
    });
    try {
      await quiet.server.probe();
      await new Promise((resolve) => setTimeout(resolve, 25_000));
      expect(pongs).toBeGreaterThanOrEqual(1);
      await expect(quiet.rpc.call("server.probe", {})).resolves.toMatchObject({
        serverTime: expect.any(String),
      });
    } finally {
      await quiet.close();
    }
  });
});
