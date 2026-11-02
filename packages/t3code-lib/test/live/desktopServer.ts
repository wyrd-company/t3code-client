// ---
// relationships:
//   implements: library-testing
// ---
/**
 * An isolated stock server in desktop mode, as a desktop launcher starts it: the
 * bootstrap document arrives on a file descriptor. The launcher in the `t3`
 * package passes only standard input to the server, so the document uses that.
 * It is a file, because the server cannot reopen the socket that Node makes for
 * a piped child.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import { serverEnvironment } from "../support/serverEnvironment.ts";
import { prepareServerHome, serverBin, stopServerProcess, waitForReady } from "./globalSetup.ts";

export interface DesktopServer {
  readonly baseUrl: string;
  stop(): Promise<void>;
}

export type DesktopCredential =
  | { readonly desktopBootstrapToken: string }
  | { readonly desktopBootstrapToken: string; readonly desktopBootstrapSecret: string };

export async function startDesktopServer(credential: DesktopCredential): Promise<DesktopServer> {
  const { root, baseDir, port, baseUrl, log } = await prepareServerHome("t3code-lib-desktop-");
  const bootstrapPath = NodePath.join(root, "bootstrap.json");
  await NodeFSP.writeFile(
    bootstrapPath,
    `${JSON.stringify({
      mode: "desktop",
      noBrowser: true,
      port,
      host: "127.0.0.1",
      tailscaleServeEnabled: false,
      tailscaleServePort: 443,
      shellEnvironmentPrepared: true,
      ...credential,
    })}\n`,
    { mode: 0o600 },
  );
  const bootstrap = await NodeFSP.open(bootstrapPath, "r");
  const server = NodeChildProcess.spawn(
    process.execPath,
    // Flags win over the environment of a parent T3 server, which can name its own port.
    [
      serverBin(),
      "serve",
      "--bootstrap-fd",
      "0",
      "--mode",
      "desktop",
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
      "--base-dir",
      baseDir,
      "--log-level",
      "warn",
    ],
    { stdio: [bootstrap.fd, log.fd, log.fd], env: serverEnvironment() },
  );
  const stop = async () => {
    await stopServerProcess(server);
    await log.close();
    await bootstrap.close();
    await NodeFSP.rm(root, { recursive: true, force: true });
  };
  try {
    await waitForReady(baseUrl, server);
  } catch (error) {
    await stop();
    throw error;
  }
  return { baseUrl, stop };
}
