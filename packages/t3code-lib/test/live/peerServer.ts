// ---
// relationships:
//   implements: library-testing
// ---
/**
 * A second isolated stock server, for a test that links two environments. It
 * has its own home and port. Its output goes to a file in that home, because
 * it can contain pairing credentials, and `stop` removes that home.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { WebSocket as WsWebSocket } from "ws";
import { T3Client } from "../../src/index.ts";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { serverEnvironment } from "../support/serverEnvironment.ts";
import { freePort, hasExited, issueToken, serverBin, waitForReady } from "./globalSetup.ts";

export interface PeerServer {
  readonly baseUrl: string;
  /** The client of the running server. `restart` replaces it. */
  readonly client: T3Client;
  /** Stop the server, run `change` on its stopped home, and start it again on the same port. */
  restart(change: (home: string) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}

export async function startPeerServer(): Promise<PeerServer> {
  const bin = serverBin();
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-lib-peer-"));
  const baseDir = NodePath.join(root, "home");
  const workspace = NodePath.join(root, "workspace");
  await NodeFSP.mkdir(workspace, { recursive: true });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const log = await NodeFSP.open(NodePath.join(root, "server.log"), "w");
  const start = () =>
    NodeChildProcess.spawn(
      process.execPath,
      [
        bin,
        "serve",
        "--port",
        String(port),
        "--host",
        "127.0.0.1",
        "--base-dir",
        baseDir,
        "--no-browser",
        "--log-level",
        "warn",
        workspace,
      ],
      { stdio: ["ignore", log.fd, log.fd], env: serverEnvironment() },
    );
  const connect = () =>
    T3Client.create({
      baseUrl,
      accessToken: issueToken(bin, baseDir),
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
  let server = start();
  const stopProcess = async () => {
    if (hasExited(server)) return;
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await exited;
  };
  const stopServer = async () => {
    await stopProcess();
    await log.close();
    await NodeFSP.rm(root, { recursive: true, force: true });
  };
  try {
    await waitForReady(baseUrl, server);
    let client = connect();
    return {
      baseUrl,
      get client() {
        return client;
      },
      restart: async (change) => {
        await client.close();
        await stopProcess();
        await change(baseDir);
        server = start();
        await waitForReady(baseUrl, server);
        client = connect();
      },
      stop: async () => {
        try {
          await client.close();
        } finally {
          await stopServer();
        }
      },
    };
  } catch (error) {
    await stopServer();
    throw error;
  }
}
