// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * The viewer socket and its two routes against an isolated stock server. The tab runs
 * in that server's own headless browser, which the server installs on first use.
 */
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import {
  T3AuthError,
  T3Client,
  generateDpopKey,
  threadId,
  type PreviewViewer,
  type PreviewViewerOutput,
} from "../../src/index.ts";
import { WebSocket as WsWebSocket } from "ws";
import type { WebSocketConstructor } from "../../src/internal/websocket.ts";
import { hasLiveServer, refusal, waitFor } from "./liveClient.ts";
import { startScratchServer, withScopes, type PeerServer } from "./peerServer.ts";
import {
  BLANK_POINT,
  PICKER_POINT,
  SAVED_FILE_BODY,
  SAVE_POINT,
  TYPED_POINT,
  startPreviewPage,
  type PreviewPage,
} from "./previewPage.ts";

const SAMPLE_THREAD = threadId("sample-thread");

const message =
  <T extends string>(type: T) =>
  (value: PreviewViewerOutput) =>
    "type" in value && value.type === type
      ? (value as Extract<PreviewViewerOutput, { readonly type: T }>)
      : undefined;

/** Takes items until one is kept, which also acknowledges each frame. */
function reader(viewer: PreviewViewer) {
  const iterator = viewer[Symbol.asyncIterator]();
  return async <R>(accept: (value: PreviewViewerOutput) => R | undefined): Promise<R> => {
    for (;;) {
      const next = await iterator.next();
      if (next.done === true) throw new Error("The viewer ended.");
      if (next.value.kind === "decode-error") throw next.value.error;
      const kept = accept(next.value.value);
      if (kept !== undefined) return kept;
    }
  };
}

const click = (viewer: PreviewViewer, point: { x: number; y: number }) => {
  const press = { type: "mouse", button: "left", clickCount: 1, ...point } as const;
  viewer.send({ ...press, action: "down", buttons: 1 });
  viewer.send({ ...press, action: "up", buttons: 0 });
};

/** A viewer of a tab. While the server installs its browser, a viewer closes at once. */
const attach = (client: T3Client, tabId: string, interactive?: boolean) =>
  waitFor(async () => {
    const viewer = await client.openPreviewViewer({
      threadId: SAMPLE_THREAD,
      tabId,
      maxWidth: 800,
      maxHeight: 600,
      quality: 50,
      ...(interactive === undefined ? {} : { interactive }),
    });
    const closed = await Promise.race([
      viewer.closed,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1_000)),
    ]);
    if (closed?.hostSetup !== undefined) {
      throw new Error(`The host needs ${closed.hostSetup.need} for its browser.`);
    }
    return closed === undefined ? viewer : undefined;
  }, "the server's browser");

describe.skipIf(!hasLiveServer)("preview viewer", () => {
  let server: PeerServer;
  let client: T3Client;
  let page: PreviewPage;
  let tabId: string;
  let viewer: PreviewViewer;
  let until: ReturnType<typeof reader>;

  /**
   * The address of the loaded page. The server reports `Loading` with the target address when
   * the request starts, before the page commits; history input sent then acts on the old entry.
   */
  const loadedUrl = async () => {
    const { sessions } = await client.rpc.call("preview.list", { threadId: SAMPLE_THREAD });
    const status = sessions.find((session) => session.tabId === tabId)?.navStatus;
    return status !== undefined && "_tag" in status && status._tag === "Success"
      ? status.url
      : undefined;
  };

  beforeAll(async () => {
    page = await startPreviewPage();
    // A container host can block the sandbox of the server's browser.
    server = await startScratchServer("t3code-lib-viewer-", () => ({
      T3CODE_SERVER_BROWSER_SANDBOX: "0",
    }));
    client = server.client;
    const tab = await client.rpc.call("preview.open", {
      threadId: SAMPLE_THREAD,
      url: page.url,
      runtime: "server",
      viewport: { _tag: "freeform", width: 800, height: 600 },
    });
    expect(tab.runtime).toBe("server");
    tabId = tab.tabId;
    viewer = await attach(client, tabId);
    until = reader(viewer);
  }, 240_000);

  afterAll(async () => {
    await viewer?.close();
    await server?.stop();
    await page?.stop();
  });

  it("sends JPEG frames and gives control to the viewer", async () => {
    const frame = await until(message("frame"));
    expect([...frame.bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    viewer.send({ type: "takeControl" });
    const control = await until((value) => {
      const next = message("control")(value);
      return next?.controller === "you" ? next : undefined;
    });
    expect(control.canOperate).toBe(true);
  });

  it("refuses a report about a tab that the server runs", async () => {
    expect(
      await refusal(
        client.rpc.call("preview.reportStatus", {
          threadId: SAMPLE_THREAD,
          tabId,
          navStatus: { _tag: "Idle" },
          canGoBack: false,
          canGoForward: false,
        }),
      ),
    ).toMatchObject({ _tag: "PreviewControlRequiredError", tabId });
  });

  it("carries a page's input", async () => {
    viewer.send({ type: "probe", ...TYPED_POINT });
    expect((await until(message("probe"))).editable).toBe(true);
    viewer.send({ type: "probe", ...BLANK_POINT });
    expect((await until(message("probe"))).editable).toBe(false);
    click(viewer, TYPED_POINT);
    viewer.send({ type: "text", text: "sample" });
    expect(await waitFor(async () => page.reported("/typed"), "the typed text")).toBe("sample");
  });

  it("answers a file picker with the upload route", async () => {
    click(viewer, PICKER_POINT);
    const chooser = await until(message("fileChooser"));
    const query = { threadId: SAMPLE_THREAD, tabId, chooser: chooser.id };
    const bytes = new TextEncoder().encode("sample upload");
    await client.routes.call("previewStream.upload", {
      query,
      body: { files: [{ name: "sample.txt", mimeType: "text/plain", bytes }] },
    });
    expect(await waitFor(async () => page.reported("/picked"), "the picked file")).toBe(
      "sample upload",
    );
    // The picker is no longer open.
    await expect(
      client.routes.call("previewStream.upload", {
        query,
        body: { files: [{ name: "sample.txt", mimeType: "text/plain", bytes }] },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("closes a file picker with no files", async () => {
    click(viewer, PICKER_POINT);
    const chooser = await until(message("fileChooser"));
    await client.routes.call("previewStream.upload", {
      query: { threadId: SAMPLE_THREAD, tabId, chooser: chooser.id },
      body: { files: [] },
    });
    await until((value) => {
      const closed = message("fileChooserClosed")(value);
      return closed?.id === chooser.id ? closed : undefined;
    });
  });

  it("reads a saved file with the download route", async () => {
    click(viewer, SAVE_POINT);
    const saved = await until(message("download"));
    expect(saved.fileName).toBe("sample.txt");
    const content = await client.routes.call("previewStream.download", {
      query: { threadId: SAMPLE_THREAD, tabId, id: saved.id },
    });
    expect(new TextDecoder().decode(content.bytes)).toBe(SAVED_FILE_BODY);
    await expect(
      client.routes.call("previewStream.download", {
        query: { threadId: SAMPLE_THREAD, tabId, id: "sample-missing" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("navigates, goes back and changes the viewport", async () => {
    const next = `${page.url}next`;
    viewer.send({ type: "navigate", url: next });
    await waitFor(async () => ((await loadedUrl()) === next ? true : undefined), "the new address");
    viewer.send({ type: "history", delta: -1 });
    await waitFor(
      async () => ((await loadedUrl()) === page.url ? true : undefined),
      "the earlier address",
    );
    viewer.send({ type: "reload" });
    viewer.send({ type: "viewport", setting: { _tag: "freeform", width: 640, height: 480 } });
    const size = await until((value) => {
      const viewport = message("viewport")(value);
      return viewport?.width === 640 ? viewport : undefined;
    });
    expect(size.height).toBe(480);
  });

  it("only lets a reader watch", async () => {
    await withScopes(server, ["orchestration:read"], async (scoped) => {
      const watcher = await attach(scoped, tabId);
      try {
        const take = reader(watcher);
        const control = await take(message("control"));
        expect(control.canOperate).toBe(false);
        await expect(
          scoped.routes.call("previewStream.upload", {
            query: { threadId: SAMPLE_THREAD, tabId, chooser: "sample" },
            body: { files: [] },
          }),
        ).rejects.toBeInstanceOf(T3AuthError);
      } finally {
        await watcher.close();
      }
    });
  });

  it("attaches a session that is bound to a key", async () => {
    const { credential } = await client.auth.createPairingCredential({ label: "sample-bound" });
    const bound = T3Client.create({
      baseUrl: server.baseUrl,
      webSocket: WsWebSocket as unknown as WebSocketConstructor,
    });
    await bound.auth.exchangePairingToken(credential, { dpopKey: generateDpopKey() });
    const watcher = await attach(bound, tabId);
    try {
      expect((await reader(watcher)(message("control"))).canOperate).toBe(true);
      await expect(
        bound.routes.call("previewStream.download", {
          query: { threadId: SAMPLE_THREAD, tabId, id: "sample-missing" },
        }),
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      await watcher.close();
      await bound.close();
    }
  });

  it("only watches when the viewer asks for it", async () => {
    const watcher = await attach(client, tabId, false);
    try {
      expect((await reader(watcher)(message("control"))).canOperate).toBe(false);
    } finally {
      await watcher.close();
    }
  });

  it("closes with the tab, and a viewer of a tab that is gone closes at once", async () => {
    await client.rpc.call("preview.close", { threadId: SAMPLE_THREAD, tabId });
    expect(await viewer.closed).toMatchObject({ code: 4404, tabGone: true, reconnect: false });
    const late = await client.openPreviewViewer({ threadId: SAMPLE_THREAD, tabId });
    expect(await late.closed).toMatchObject({ code: 4404, tabGone: true });
  });
});
