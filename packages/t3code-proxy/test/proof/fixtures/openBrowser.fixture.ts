// ---
// relationships:
//   verifies: proxy
// ---
/** Opens a browser, reports it, and holds if `lifetime.proof.test.ts` will stop this run. */
import * as NodeFSP from "node:fs/promises";
import { it } from "vite-plus/test";
import { WebClient } from "../webClient.ts";

it("opens a browser", async () => {
  const client = new WebClient("lifetime");
  await client.run("open", "about:blank");
  const info = JSON.parse(await client.run("session", "info", "--json")) as {
    data: { pid: number };
  };
  const reportPath = process.env["T3_PROOF_LIFETIME_REPORT"] as string;
  await NodeFSP.writeFile(
    `${reportPath}.partial`,
    JSON.stringify({
      daemonPid: info.data.pid,
      workerPid: process.pid,
      vitestPid: process.ppid,
      cdpUrl: await client.run("get", "cdp-url"),
      namespace: process.env["AGENT_BROWSER_NAMESPACE"],
      socketDir: process.env["AGENT_BROWSER_SOCKET_DIR"],
    }),
  );
  await NodeFSP.rename(`${reportPath}.partial`, reportPath);
  // The timer keeps this worker busy, as a test that polls a server is.
  if (process.env["T3_PROOF_LIFETIME_HOLD"] === "1") {
    await new Promise(() => setInterval(() => undefined, 1_000));
  }
  await client.close();
});
