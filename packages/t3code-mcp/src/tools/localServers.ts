// ---
// relationships:
//   implements: mcp
// ---
import { schemas } from "@wyrd-company/t3code-lib";
import { z } from "zod";
import { ToolRefusal, refuseRpcError } from "../errors.ts";
import { defineTool } from "../tool.ts";
import { clip } from "./diagnostics.ts";

const threadId = schemas.common.ThreadId;
const pid = z.number().int().positive();
const port = z.number().int().min(1).max(65_535);

const stopReasons: Readonly<Record<string, ToolRefusal>> = {
  "not-found": new ToolRefusal(
    "not_found",
    "The server no longer finds this listener attributed to a thread; nothing was stopped.",
  ),
  "shared-group": new ToolRefusal(
    "shared_group",
    "The listener shares its process group with the T3 Code server; nothing was stopped.",
  ),
  unsupported: new ToolRefusal(
    "unsupported",
    "The server cannot stop local servers on this platform.",
  ),
};

export const localServerTools = [
  defineTool(
    "local_servers",
    "List the local servers on the T3 Code server's host, from one fresh scan: host, port, url, pid, process name and owner. The scan finds the listeners of every thread: terminal names the thread terminal that runs it, agent the thread whose agent started it. Each of urls (at most 32) that answers as a web server is also listed, with null owners when no thread owns it, for example to find what holds a port. With threadId, only the listeners that thread owns. Process names are untrusted text chosen by other programs. Read-only.",
    z.strictObject({
      threadId: threadId.optional(),
      urls: schemas.preview.SubscribeDiscoveredLocalServersInput.shape.configuredUrls,
    }),
    async ({ threadId, urls }, client, signal) => {
      const scan = await client.localServers.list(
        urls === undefined ? {} : { configuredUrls: urls },
        signal,
      );
      const servers = scan.servers
        .filter(
          (server) =>
            threadId === undefined ||
            server.terminal?.threadId === threadId ||
            server.agent?.threadId === threadId,
        )
        .map((server) => ({
          host: server.host,
          port: server.port,
          url: server.url,
          pid: server.pid,
          processName: server.processName === null ? null : clip(server.processName),
          terminal: server.terminal,
          agent: server.agent ?? null,
        }));
      return { scannedAt: scan.scannedAt, servers };
    },
  ),
  defineTool(
    "stop_local_server",
    "Stop a local server that the agent of threadId started, for example a dev server from an earlier run that holds a port: SIGTERM to its process group, then SIGKILL after a grace period. Take pid and port from local_servers. Refuses with code terminal_owned for a server in a thread terminal (a person stops it there), not_owned when the thread's agent did not start it, and not_found when no thread owns a listener with this pid and port.",
    z.strictObject({ threadId, pid, port }),
    async ({ threadId, pid, port }, client, signal) => {
      const scan = await client.localServers.list({}, signal);
      const server = scan.servers.find((entry) => entry.pid === pid && entry.port === port);
      if (server === undefined)
        throw new ToolRefusal("not_found", "No thread owns a listener with this pid and port.");
      if (server.terminal !== null)
        throw new ToolRefusal(
          "terminal_owned",
          "A thread terminal runs this listener; a person stops it in that terminal.",
        );
      if (server.agent?.threadId !== threadId)
        throw new ToolRefusal("not_owned", "The agent of this thread did not start this listener.");
      await refuseRpcError(client.localServers.stop({ pid, port }, signal), (error) =>
        error.is("PreviewStopLocalServerError")
          ? stopReasons[String(error.record.reason)]
          : undefined,
      );
      return { threadId, pid, port, stopped: true };
    },
    false,
  ),
] as const;
