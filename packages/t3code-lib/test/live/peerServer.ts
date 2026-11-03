// ---
// relationships:
//   implements: library-testing
// ---
/**
 * A second isolated stock server, for a test that links two environments. It
 * has its own home and port. Its output goes to a file in that home, because
 * it can contain pairing credentials, and `stop` removes that home.
 * A scratch server also has its own `HOME`, for a method that can reach a login
 * or an installed provider.
 */
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import type { T3Client } from "../../src/index.ts";
import { clearedMachineAccess } from "../support/serverEnvironment.ts";
import {
  issueToken,
  prepareServerHome,
  serverBin,
  spawnServer,
  stopServerProcess,
  waitForReady,
} from "./globalSetup.ts";
import { connectTo, connectWithScopes } from "./liveClient.ts";

export interface PeerServer {
  readonly baseUrl: string;
  /** The client of the running server. `restart` replaces it. */
  readonly client: T3Client;
  /** Stop the server, run `change` on its stopped home, and start it again on the same port. */
  restart(change: (home: string) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}

/** The `PATH` of a server that finds a stub in `dir` first. */
export function pathWith(dir: string): { readonly PATH: string } {
  return { PATH: `${dir}${NodePath.delimiter}${process.env["PATH"] ?? ""}` };
}

export async function startPeerServer(
  options: { readonly environment?: NodeJS.ProcessEnv } = {},
): Promise<PeerServer> {
  const bin = serverBin();
  const { root, baseDir, workspace, port, baseUrl, log } =
    await prepareServerHome("t3code-lib-peer-");
  const start = () =>
    spawnServer({
      bin,
      port,
      baseDir,
      workspace,
      logFd: log.fd,
      ...(options.environment === undefined ? {} : { environment: options.environment }),
    });
  const connect = () => connectTo(baseUrl, issueToken(bin, baseDir));
  let server = start();
  const stopServer = async () => {
    await stopServerProcess(server);
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
        await stopServerProcess(server);
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

/**
 * A peer server whose `HOME` and `CODEX_HOME` are in a new folder, with the prefix
 * `name`, and that inherits no value in `clearedMachineAccess`. `prepare` fills that
 * folder, before the server starts, and returns more of the server's environment.
 * `stop` also removes the folder.
 */
export async function startScratchServer(
  name: string,
  prepare: (home: string) => NodeJS.ProcessEnv | Promise<NodeJS.ProcessEnv> = () => ({}),
): Promise<PeerServer> {
  const home = await NodeFSP.realpath(await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), name)));
  const removeHome = () => NodeFSP.rm(home, { recursive: true, force: true });
  try {
    const peer = await startPeerServer({
      environment: {
        ...clearedMachineAccess(),
        ...(await prepare(home)),
        HOME: home,
        CODEX_HOME: NodePath.join(home, ".codex"),
      },
    });
    return {
      baseUrl: peer.baseUrl,
      get client() {
        return peer.client;
      },
      restart: (change) => peer.restart(change),
      stop: async () => {
        try {
          await peer.stop();
        } finally {
          await removeHome();
        }
      },
    };
  } catch (error) {
    await removeHome();
    throw error;
  }
}

/** Runs `use` with a client of `server` that holds only `scopes`, then closes that client. */
export async function withScopes<T>(
  server: Pick<PeerServer, "baseUrl" | "client">,
  scopes: Parameters<typeof connectWithScopes>[1],
  use: (client: T3Client) => Promise<T>,
): Promise<T> {
  const scoped = await connectWithScopes(server.client, scopes, server.baseUrl);
  try {
    return await use(scoped);
  } finally {
    await scoped.close();
  }
}
