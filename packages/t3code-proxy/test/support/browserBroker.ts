// ---
// relationships:
//   verifies: proxy
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeHttp from "node:http";
import type { AddressInfo } from "node:net";

export const BROWSER_STOPPING = "The proof is stopping, so it starts no browser command.";

/**
 * Runs each browser command for the test workers from one process. A worker can run during a stop,
 * and any browser command can start a browser. With one owner, `drain` ends the commands: after it,
 * no command runs and none can start.
 */
export async function startBrowserBroker(execute: (args: string[]) => Promise<string>) {
  const inFlight = new Set<Promise<unknown>>();
  let draining = false;

  const server = NodeHttp.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += String(chunk)));
    request.on("end", () => {
      // No await separates this check from the start of the command.
      if (draining) {
        response.writeHead(503).end(BROWSER_STOPPING);
        return;
      }
      const command = execute(JSON.parse(body) as string[]).then(
        (output) => void response.writeHead(200).end(output),
        (error: Error) => void response.writeHead(500).end(error.message),
      );
      inFlight.add(command);
      void command.finally(() => inFlight.delete(command));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  server.unref();

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    drain: async () => {
      draining = true;
      await Promise.allSettled(inFlight);
    },
    close: () => {
      server.close();
      server.closeAllConnections();
    },
  };
}

/**
 * Runs one command in its own process group, and returns its output. A signal to the proof's group
 * must not end a command that is starting a daemon, because `close --all` could not find that daemon
 * yet. `execFile` does not pass on `detached`.
 */
export const runInOwnGroup = (command: string, args: readonly string[], timeout: number) =>
  new Promise<string>((resolve, reject) => {
    const child = NodeChildProcess.spawn(command, args, {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (errors += String(chunk)));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} ended with ${code ?? signal}: ${errors.trim()}`));
    });
  });

/** Sends one browser command to the broker, and returns its output. */
export async function sendBrowserCommand(url: string, args: readonly string[]) {
  const response = await fetch(url, { method: "POST", body: JSON.stringify(args) });
  const output = await response.text();
  if (!response.ok) throw new Error(output);
  return output;
}
