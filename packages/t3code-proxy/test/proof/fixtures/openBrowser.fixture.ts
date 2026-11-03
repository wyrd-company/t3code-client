// ---
// relationships:
//   verifies: proxy
// ---
/**
 * Opens a browser and reports it. If `lifetime.proof.test.ts` will stop this run, it then sends
 * browser commands, as a test that polls a page does, for as long as the owner process lives.
 */
import * as NodeFSP from "node:fs/promises";
import { it } from "vite-plus/test";
import { BROWSER_STOPPING } from "../../support/browserBroker.ts";
import { WebClient } from "../webClient.ts";

const ownerLives = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

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
  if (process.env["T3_PROOF_LIFETIME_HOLD"] === "1") {
    const owner = Number(process.env["T3_PROOF_LIFETIME_OWNER"]);
    while (ownerLives(owner)) {
      await client.run("get", "url").catch(async (error: Error) => {
        if (error.message === BROWSER_STOPPING) {
          await NodeFSP.writeFile(`${reportPath}.refused`, "");
        }
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await client.close();
});
