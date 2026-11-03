// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import {
  DiscoveredLocalServerList,
  PreviewAdjustInput,
  PreviewEvent,
  PreviewOpenInput,
  PreviewReportProfilesInput,
  PreviewReportStatusInput,
  PreviewResizeInput,
  PreviewSessionSnapshot,
} from "./preview.ts";
import {
  PreviewStreamHostSetup,
  PreviewUploadBody,
  PreviewViewerInput,
  PreviewViewerMessage,
  PreviewViewerTarget,
} from "./previewViewer.ts";

const tab = { threadId: "thread-1", tabId: "tab-1" };
const snapshot = {
  ...tab,
  navStatus: { _tag: "Idle" },
  canGoBack: false,
  canGoForward: false,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("preview inputs", () => {
  it("applies the bounds of a viewport", () => {
    const resize = (viewport: unknown) =>
      PreviewResizeInput.safeParse({ ...tab, viewport }).success;
    expect(resize({ _tag: "fill" })).toBe(true);
    expect(resize({ _tag: "freeform", width: 800, height: 600 })).toBe(true);
    expect(resize({ _tag: "freeform", width: 239, height: 600 })).toBe(false);
    expect(resize({ _tag: "freeform", width: 3840, height: 3840 })).toBe(false);
    expect(resize({ _tag: "preset", width: 800, height: 600, presetId: "pixel-8" })).toBe(true);
    expect(resize({ _tag: "preset", width: 800, height: 600, presetId: "sample" })).toBe(false);
    expect(resize({ _tag: "future" })).toBe(false);
  });

  it("closes the values that a result leaves open", () => {
    const report = (navStatus: unknown) =>
      PreviewReportStatusInput.safeParse({
        ...tab,
        navStatus,
        canGoBack: false,
        canGoForward: false,
      }).success;
    expect(report({ _tag: "Idle" })).toBe(true);
    expect(report({ _tag: "Future" })).toBe(false);
    expect(PreviewOpenInput.safeParse({ threadId: "t", runtime: "future" }).success).toBe(false);
    expect(PreviewAdjustInput.safeParse({ ...tab, zoomFactor: 1.25 }).success).toBe(true);
    expect(PreviewAdjustInput.safeParse({ ...tab, zoomFactor: 1.3 }).success).toBe(false);
    expect(PreviewAdjustInput.safeParse({ ...tab, colorScheme: "future" }).success).toBe(false);
    const profile = (id: string) => ({
      profiles: [{ id, name: "Sample", kind: "persistent" }],
      defaultProfileId: "default",
    });
    expect(PreviewReportProfilesInput.safeParse(profile("sample")).success).toBe(true);
    expect(PreviewReportProfilesInput.safeParse(profile("sa\u0000mple")).success).toBe(false);
  });
});

describe("preview results", () => {
  it("keeps a status and a viewport from a newer server", () => {
    const decoded = PreviewSessionSnapshot.parse({
      ...snapshot,
      navStatus: { _tag: "Future" },
      viewport: { _tag: "future" },
      runtime: "future",
    });
    expect(decoded.navStatus).toMatchObject({ unknown: true });
    expect(decoded.viewport).toMatchObject({ unknown: true });
    expect(decoded.runtime).toBe("future");
  });

  it("decodes each event, and an unknown one", () => {
    const base = {
      ...tab,
      createdAt: "2026-01-01T00:00:00.000Z",
      serverEpoch: "epoch-1",
      revision: 1,
    };
    for (const event of [
      { ...base, type: "opened", snapshot },
      { ...base, type: "navigated", snapshot },
      { ...base, type: "resized", snapshot, request: { hardReload: true, clear: "cache" } },
      { ...base, type: "closed" },
      {
        ...base,
        type: "failed",
        url: "http://127.0.0.1:1/",
        title: "",
        code: -2,
        description: "failed",
        download: { id: "file-1", fileName: "sample.txt" },
      },
    ]) {
      expect(PreviewEvent.parse(event)).toMatchObject({ type: event.type });
    }
    expect(PreviewEvent.parse({ ...base, type: "future" })).toMatchObject({ unknown: true });
    expect(PreviewEvent.safeParse({ ...base, type: "opened" }).success).toBe(false);
  });

  it("decodes an attributed and an unattributed local server", () => {
    const server = { host: "127.0.0.1", port: 1, url: "http://127.0.0.1:1/" };
    const list = DiscoveredLocalServerList.parse({
      servers: [
        { ...server, processName: null, pid: null, terminal: null },
        {
          ...server,
          processName: "sample",
          pid: 1,
          terminal: { threadId: "thread-1", terminalId: "terminal-1" },
          agent: { threadId: "thread-1" },
        },
      ],
      scannedAt: "2026-01-01T00:00:00.000Z",
      configuredUrlProbing: true,
    });
    expect(list.servers[1]?.agent?.threadId).toBe("thread-1");
  });
});

describe("the preview viewer", () => {
  it("decodes what the server sends, and an unknown message", () => {
    for (const message of [
      { type: "viewport", width: 1, height: 1 },
      {
        type: "control",
        canOperate: true,
        controller: "agent",
        generation: 1,
        dialog: { type: "alert", message: "sample", defaultValue: "" },
      },
      { type: "probe", x: 1, y: 1, editable: false },
      { type: "clipboard", text: "sample" },
      { type: "pointer", phase: "click", x: 1, y: 1, sequence: 1 },
      { type: "fileChooser", id: "chooser-1", multiple: false, accept: "" },
      { type: "fileChooserClosed", id: "chooser-1" },
      { type: "popup", tabId: "tab-2" },
      { type: "download", id: "file-1", fileName: "sample.txt", sizeBytes: 1 },
    ]) {
      expect(PreviewViewerMessage.parse(message)).toMatchObject({ type: message.type });
    }
    expect(PreviewViewerMessage.parse({ type: "future" })).toMatchObject({ unknown: true });
    expect(PreviewViewerMessage.safeParse({ type: "probe" }).success).toBe(false);
    expect(PreviewStreamHostSetup.parse({ need: "future", command: "sample" }).need).toBe("future");
  });

  it("closes what a viewer sends", () => {
    expect(PreviewViewerInput.safeParse({ type: "takeControl" }).success).toBe(true);
    expect(PreviewViewerInput.safeParse({ type: "ack" }).success).toBe(false);
    expect(PreviewViewerInput.safeParse({ type: "future" }).success).toBe(false);
    const mouse = { type: "mouse", action: "move", x: 1, y: 1 };
    expect(PreviewViewerInput.safeParse(mouse).success).toBe(true);
    expect(PreviewViewerInput.safeParse({ ...mouse, modifiers: 16 }).success).toBe(false);
    expect(PreviewViewerInput.safeParse({ ...mouse, extra: true }).success).toBe(false);
    expect(PreviewViewerInput.safeParse({ type: "text", text: "" }).success).toBe(false);
    expect(PreviewViewerInput.safeParse({ type: "resize", width: 99, height: 100 }).success).toBe(
      false,
    );
    expect(PreviewViewerTarget.safeParse({ ...tab, quality: 101 }).success).toBe(false);
  });

  it("applies the limits of an upload", () => {
    const file = (size: number) => ({
      name: "sample.txt",
      mimeType: "text/plain",
      bytes: new Uint8Array(size),
    });
    expect(PreviewUploadBody.safeParse({ files: [] }).success).toBe(true);
    expect(PreviewUploadBody.safeParse({ files: Array(21).fill(file(1)) }).success).toBe(false);
    expect(PreviewUploadBody.safeParse({ files: [file(100 * 1024 * 1024 + 1)] }).success).toBe(
      false,
    );
  });
});
