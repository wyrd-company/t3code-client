// ---
// relationships:
//   verifies: library
// ---
/**
 * Tab state and local servers against an isolated stock server. These tabs have the
 * `desktop` runtime, so no browser starts. `previewViewer.live.test.ts` drives one.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { threadId, type T3Client } from "../../src/index.ts";
import { firstItem, hasLiveServer, refusal } from "./liveClient.ts";
import { startScratchServer, withScopes, type PeerServer } from "./peerServer.ts";

const SAMPLE_THREAD = threadId("sample-thread");
const SAMPLE_PAGE = "http://127.0.0.1:9/sample";

describe.skipIf(!hasLiveServer)("previews", () => {
  let server: PeerServer;
  let client: T3Client;

  beforeAll(async () => {
    server = await startScratchServer("t3code-lib-preview-");
    client = server.client;
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
  });

  it("opens, adjusts, lists and closes a tab that a desktop client hosts", async () => {
    const events = client.rpc.stream("subscribePreviewEvents", {});
    const opened = firstItem(events, (event) =>
      "type" in event && event.type === "opened" && event.threadId === SAMPLE_THREAD
        ? event
        : undefined,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    const tab = await client.rpc.call("preview.open", {
      threadId: SAMPLE_THREAD,
      url: SAMPLE_PAGE,
      viewport: { _tag: "freeform", width: 800, height: 600 },
      runtime: "desktop",
    });
    expect(tab.runtime).toBe("desktop");
    expect(tab.viewport).toEqual({ _tag: "freeform", width: 800, height: 600 });
    expect((await opened).snapshot.tabId).toBe(tab.tabId);

    const resized = await client.rpc.call("preview.resize", {
      threadId: SAMPLE_THREAD,
      tabId: tab.tabId,
      viewport: { _tag: "preset", width: 390, height: 844, presetId: "iphone-12-pro" },
    });
    expect(resized.viewport).toMatchObject({ _tag: "preset", presetId: "iphone-12-pro" });
    const adjusted = await client.rpc.call("preview.adjust", {
      threadId: SAMPLE_THREAD,
      tabId: tab.tabId,
      colorScheme: "dark",
      zoomFactor: 1.25,
    });
    expect(adjusted).toMatchObject({ colorScheme: "dark", zoomFactor: 1.25 });

    await client.rpc.call("preview.reportStatus", {
      threadId: SAMPLE_THREAD,
      tabId: tab.tabId,
      navStatus: { _tag: "Success", url: SAMPLE_PAGE, title: "Sample page" },
      canGoBack: false,
      canGoForward: false,
    });
    const listed = await client.rpc.call("preview.list", { threadId: SAMPLE_THREAD });
    expect(listed.revision).toBeGreaterThan(0);
    expect(listed.sessions.find((session) => session.tabId === tab.tabId)?.navStatus).toEqual({
      _tag: "Success",
      url: SAMPLE_PAGE,
      title: "Sample page",
    });

    await client.rpc.call("preview.close", { threadId: SAMPLE_THREAD, tabId: tab.tabId });
    const after = await client.rpc.call("preview.list", { threadId: SAMPLE_THREAD });
    expect(after.sessions.some((session) => session.tabId === tab.tabId)).toBe(false);
  });

  it("refuses a bad address and a tab that it does not know, as typed failures", async () => {
    expect(
      await refusal(
        client.rpc.call("preview.open", { threadId: SAMPLE_THREAD, url: "ftp://sample.invalid/" }),
      ),
    ).toMatchObject({ _tag: "PreviewInvalidUrlError", reason: "unsupported-protocol" });
    expect(
      await refusal(
        client.rpc.call("preview.resize", {
          threadId: SAMPLE_THREAD,
          tabId: "sample-missing",
          viewport: { _tag: "fill" },
        }),
      ),
    ).toMatchObject({ _tag: "PreviewSessionLookupError", tabId: "sample-missing" });
  });

  it("accepts browser profiles and clears the data of one", async () => {
    await client.rpc.call("preview.reportProfiles", {
      profiles: [{ id: "sample-profile", name: "Sample", kind: "persistent" }],
      defaultProfileId: "sample-profile",
      recordingFrameRate: 30,
    });
    await client.rpc.call("preview.clearProfile", { profileId: "sample-profile" });
  });

  it("needs its scopes on the server", async () => {
    await withScopes(server, ["orchestration:read"], async (reader) => {
      await reader.rpc.call("preview.list", { threadId: SAMPLE_THREAD });
      const raw = await refusal(reader.rpc.callRaw("preview.open", { threadId: SAMPLE_THREAD }));
      expect(raw).toMatchObject({ requiredPermission: "preview:operate" });
      const stop = await refusal(
        reader.rpc.callRaw("preview.stopLocalServer", { pid: 1, port: 1 }),
      );
      expect(stop).toMatchObject({ requiredPermission: "terminal:operate" });
    });
  });

  it("lists a local server and stops it only when a thread owns it", async () => {
    const home = await NodeFSP.mkdtemp(NodePath.join(process.env["TMPDIR"] ?? "/tmp", "t3-local-"));
    const script = NodePath.join(home, "listener.mjs");
    await NodeFSP.writeFile(
      script,
      `import * as http from "node:http";
const server = http.createServer((_, response) => { response.setHeader("content-type", "text/html"); response.end("<title>sample</title>"); });
server.listen(0, "127.0.0.1", () => process.stdout.write(String(server.address().port) + "\\n"));\n`,
    );
    // Its own process group and thread attribution: the two things that the server needs.
    const listener = NodeChildProcess.spawn(process.execPath, [script], {
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
      env: { PATH: process.env["PATH"] ?? "", T3CODE_THREAD_ID: SAMPLE_THREAD },
    });
    const pid = listener.pid as number;
    const exited = new Promise<void>((resolve) => listener.once("exit", () => resolve()));
    try {
      const port = await new Promise<number>((resolve, reject) => {
        listener.stdout.once("data", (chunk: Buffer) => resolve(Number(chunk.toString().trim())));
        listener.once("error", reject);
      });
      const found = await firstItem(
        client.rpc.stream("subscribeDiscoveredLocalServers", {
          configuredUrls: [`http://127.0.0.1:${port}/`],
        }),
        (list) => list.servers.find((entry) => entry.port === port && entry.pid === pid),
      );
      expect(found.agent).toEqual({ threadId: SAMPLE_THREAD });

      expect(
        await refusal(
          client.rpc.call("preview.stopLocalServer", { pid, port: port === 1 ? 2 : 1 }),
        ),
      ).toMatchObject({ _tag: "PreviewStopLocalServerError", reason: "not-found" });
      await client.rpc.call("preview.stopLocalServer", { pid, port });
      await exited;
    } finally {
      // Only the process that this test started.
      if (listener.exitCode === null && listener.signalCode === null) listener.kill("SIGKILL");
      await NodeFSP.rm(home, { recursive: true, force: true });
    }
  });
});
