#!/usr/bin/env node
// ---
// relationships:
//   implements: library-testing
// ---
/**
 * Plays the tunnel client for a live test. It answers the version check and, on `tunnel run`,
 * serves the two metrics routes that report a tunnel host. It reaches no network.
 */
import * as NodeHttp from "node:http";

if (process.argv.includes("--version") || process.argv[2] === "version") {
  console.log("cloudflared version 2099.1.0");
} else {
  const host = process.env.SAMPLE_TUNNEL_HOST;
  const server = NodeHttp.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify(
        request.url === "/ready"
          ? { readyConnections: 1 }
          : { config: { ingress: [{ hostname: host }] } },
      ),
    );
  });
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    console.error(`INF Starting metrics server on 127.0.0.1:${port}/metrics`);
  });
}
