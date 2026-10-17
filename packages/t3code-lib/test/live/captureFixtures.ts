/**
 * Captures `test/fixtures/` from the `t3` devDependency: starts it as the live
 * tests do, creates a sample project and thread, reads the environment
 * descriptor, server config, shell snapshot, and thread detail, and writes
 * them with paths, host names, and provider accounts replaced by generic
 * values and skill and command listings emptied.
 *
 *   node test/live/captureFixtures.ts
 */
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import { WebSocket as WsWebSocket } from "ws";
import { T3Client } from "../../src/client.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { threadId } from "../../src/schemas/common.ts";
import setup from "./globalSetup.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const SAMPLE_THREAD_ID = threadId("11111111-2222-4333-8444-555555555555");
const SAMPLE_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Provider listings that would carry this machine's skills, commands, and accounts. */
function sanitizeProviders(config: { [key: string]: Json }): void {
  const providers = config["providers"];
  if (!Array.isArray(providers)) return;
  for (const provider of providers) {
    if (provider === null || typeof provider !== "object" || Array.isArray(provider)) continue;
    provider["skills"] = [];
    provider["slashCommands"] = [];
    const auth = provider["auth"];
    if (auth === null || typeof auth !== "object" || Array.isArray(auth)) continue;
    if ("email" in auth) auth["email"] = "user@example.test";
    if ("workspaceId" in auth) auth["workspaceId"] = SAMPLE_WORKSPACE_ID;
  }
}

function genericText(text: string, liveHome: string, workspaceRoot: string): string {
  return text
    .split(workspaceRoot)
    .join("/srv/sample")
    .split(liveHome)
    .join("/home/sample/.t3")
    .split(NodeOS.homedir())
    .join("/home/sample")
    .split(NodeOS.hostname())
    .join("sample-environment")
    .split(NodeOS.userInfo().username)
    .join("sample");
}

const teardown = await setup();
const baseUrl = process.env["T3_LIVE_URL"] ?? "";
const token = process.env["T3_LIVE_TOKEN"] ?? "";
const liveHome = process.env["T3_LIVE_HOME"] ?? "";
const workspaceRoot = process.env["T3_LIVE_WORKSPACE"] ?? "";
const client = T3Client.create({
  baseUrl,
  accessToken: token,
  clientLabel: "t3code-client-fixtures",
  webSocket: WsWebSocket as unknown as WebSocketConstructor,
});
try {
  const project = await client.projects.ensure({ workspaceRoot, title: "Example project" });
  await client.threads.ensure({
    threadId: SAMPLE_THREAD_ID,
    projectId: project.id,
    title: "Example thread",
    modelSelection: { instanceId: "codex" as never, model: "gpt-6-luna" },
    runtimeMode: "auto",
  });
  const read = async (path: string): Promise<Json> => {
    const response = await fetch(new URL(path, baseUrl), {
      headers: { authorization: `Bearer ${token}`, "x-t3-orchestration-protocol": "2" },
    });
    if (!response.ok) throw new Error(`GET ${path} answered ${response.status}.`);
    return (await response.json()) as Json;
  };
  const config = (await client.rpc.callRaw("server.getConfig", {})) as { [key: string]: Json };
  sanitizeProviders(config);
  const captured: Record<string, Json> = {
    environment: await read("/.well-known/t3/environment"),
    "server-config": config,
    "orchestration-shell": await read("/api/orchestration/shell"),
    "orchestration-thread-detail": await read(`/api/orchestration/threads/${SAMPLE_THREAD_ID}`),
  };
  for (const [name, payload] of Object.entries(captured)) {
    const text = genericText(JSON.stringify(payload, null, 2), liveHome, workspaceRoot);
    await NodeFSP.writeFile(new URL(`${name}.json`, FIXTURES), `${text}\n`);
  }
} finally {
  await client.close();
  await teardown?.();
}
