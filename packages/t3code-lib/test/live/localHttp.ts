// ---
// relationships:
//   implements: library-testing
// ---
/** A local HTTP server for a stub that a live test's server calls. It binds to loopback only. */
import * as NodeHttp from "node:http";
import type { AddressInfo } from "node:net";

export interface LocalHttp {
  readonly port: number;
  /** The origin of the server, with no trailing slash. */
  readonly url: string;
  /** Stops the server, and drops each connection that a client keeps open. */
  close(): Promise<void>;
}

export async function startLocalHttp(listener: NodeHttp.RequestListener): Promise<LocalHttp> {
  const server = NodeHttp.createServer(listener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
