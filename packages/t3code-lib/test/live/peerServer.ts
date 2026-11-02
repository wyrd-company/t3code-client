// ---
// relationships:
//   implements: library-testing
// ---
/**
 * A second isolated stock server, for a test that links two environments. It
 * has its own home and port. Its output goes to a file in that home, because
 * it can contain pairing credentials, and `stop` removes that home.
 */
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import type { T3Client } from "../../src/index.ts";
import {
  issueToken,
  prepareServerHome,
  serverBin,
  spawnServer,
  stopServerProcess,
  waitForReady,
} from "./globalSetup.ts";
import { connectTo } from "./liveClient.ts";

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
