// ---
// relationships:
//   verifies: command-line
// ---
import { vi } from "vite-plus/test";
import {
  T3Client,
  threadId,
  projectId,
  providerInstanceId,
  runId,
  messageId,
  commandId,
  type TurnHandle,
  type OrchestrationProjectShell,
  type OrchestrationV2ThreadShell,
} from "@wyrd-company/t3code-lib";
import { createInvocation } from "../src/context.ts";
import { Output } from "../src/output.ts";

const clients: T3Client[] = [];
/** Close clients and restore spies; call from afterEach. */
export async function closeDispatchClients(): Promise<void> {
  for (const client of clients.splice(0)) await client.close();
  vi.restoreAllMocks();
}
/** A connected, authorized client whose dispatch facades are spies. */
export function setup() {
  const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
  clients.push(client);
  const invocation = createInvocation({}, new Output({ stdout() {}, stderr() {} }));
  vi.spyOn(invocation, "client").mockResolvedValue(client);
  const project = {
    id: projectId("sample-project"),
    workspaceRoot: "/sample",
    defaultModelSelection: {
      instanceId: providerInstanceId("sample-provider"),
      model: "sample-model",
    },
  } as OrchestrationProjectShell;
  const existing = {
    id: threadId("sample-thread"),
    projectId: project.id,
    modelSelection: project.defaultModelSelection,
  } as OrchestrationV2ThreadShell;
  const session = vi.spyOn(client.auth, "sessionState").mockResolvedValue({
    authenticated: true,
    scopes: ["orchestration:read", "orchestration:operate"],
  } as Awaited<ReturnType<typeof client.auth.sessionState>>);
  const config = vi.spyOn(client.server, "getConfig").mockResolvedValue({
    settings: { defaultRuntimeMode: "configured-mode" },
    providers: [
      {
        instanceId: "sample-provider",
        enabled: true,
        installed: true,
        status: "ready",
        models: [{ slug: "sample-model" }, { slug: "custom-model", isCustom: true }],
      },
    ],
  } as unknown as Awaited<ReturnType<typeof client.server.getConfig>>);
  const settings = vi.spyOn(client.server, "getSettings").mockResolvedValue({});
  const getProject = vi.spyOn(client.projects, "get").mockResolvedValue(project);
  vi.spyOn(client.projects, "ensureScratch").mockResolvedValue({ projectId: project.id });
  const getThread = vi.spyOn(client.threads, "get").mockResolvedValue(existing);
  const create = vi.spyOn(client.threads, "create").mockResolvedValue(existing);
  const update = vi.spyOn(client.threads, "update").mockResolvedValue();
  const launch = vi.spyOn(client.threads, "launch");
  const turn = {
    threadId: existing.id,
    runId: runId("linked-run"),
    messageId: messageId("sent-message"),
    commandId: commandId("sent-command"),
  } as TurnHandle;
  const start = vi.spyOn(client.threads, "startTurn").mockResolvedValue(turn);
  return {
    invocation,
    client,
    project,
    existing,
    session,
    config,
    settings,
    getProject,
    getThread,
    create,
    update,
    launch,
    start,
    turn,
  };
}
