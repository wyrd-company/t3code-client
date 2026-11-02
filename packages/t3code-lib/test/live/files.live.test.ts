// ---
// relationships:
//   verifies: library-wire
// ---
/** File methods and the signed asset and upload routes on a real stock server. */
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import {
  T3HttpError,
  T3NotFoundError,
  assetUrlParams,
  attachmentUploadUrlParams,
  commandId,
  messageId,
  projectId,
} from "../../src/index.ts";
import { connect, hasLiveServer, modelSelection, refusal, waitFor } from "./liveClient.ts";
import { startPeerServer } from "./peerServer.ts";

/** A one-pixel PNG. */
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==",
  "base64",
);

describe.skipIf(!hasLiveServer)("file methods and routes", () => {
  const client = connect();
  let workspace: string;

  beforeAll(async () => {
    workspace = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-lib-files-"));
    await NodeFSP.mkdir(NodePath.join(workspace, "assets"));
    await NodeFSP.writeFile(NodePath.join(workspace, "image.png"), png);
    await NodeFSP.writeFile(NodePath.join(workspace, "page.html"), "<p>sample</p>");
    await NodeFSP.writeFile(NodePath.join(workspace, "assets", "style.css"), "p { margin: 0 }");
  });

  afterAll(async () => {
    await client.close();
    await NodeFSP.rm(workspace, { recursive: true, force: true });
  });

  const read = (relativeUrl: string) =>
    client.routes.call("assets.read", { params: assetUrlParams(relativeUrl) });

  it("browses a directory and reads the metadata of paths", async () => {
    const listing = await client.rpc.call("filesystem.browse", { partialPath: `${workspace}/` });
    expect(listing.parentPath).toBe(workspace);
    expect(listing.entries.map((entry) => entry.name)).toContain("assets");

    const missing = NodePath.join(workspace, "missing.txt");
    const { entries } = await client.rpc.call("filesystem.getMetadata", {
      paths: [NodePath.join(workspace, "image.png"), workspace, missing],
    });
    expect(entries[0]).toMatchObject({ kind: "file", byteLength: png.byteLength });
    expect(entries[1]).toMatchObject({ kind: "directory" });
    expect(entries[2]).toBeNull();
  });

  it("refuses to browse a relative path without a project, with a typed record", async () => {
    const record = await refusal(
      client.rpc.call("filesystem.browse", { partialPath: "./sample/" }),
    );
    expect(record).toMatchObject({
      _tag: "FilesystemBrowseError",
      failure: "current_project_required",
    });
  });

  it("uploads a file through a signed URL, reads it back, and deletes it", async () => {
    const body = new TextEncoder().encode("sample contents");
    const upload = await client.rpc.call("attachments.createUploadUrl", {
      type: "file",
      name: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: body.byteLength,
    });
    const params = attachmentUploadUrlParams(upload.relativeUrl);
    await client.routes.call("attachments.upload", { params, body });

    const url = await client.rpc.call("assets.createUrl", {
      resource: { _tag: "attachment", attachmentId: upload.attachmentId, fileName: "notes.txt" },
    });
    const content = await read(url.relativeUrl);
    expect(new TextDecoder().decode(content.bytes)).toBe("sample contents");
    expect(content.contentType).toBeDefined();

    await client.rpc.call("attachments.delete", { attachmentId: upload.attachmentId });
    await expect(read(url.relativeUrl)).rejects.toThrow(T3NotFoundError);
    expect(
      await refusal(
        client.rpc.call("assets.createUrl", {
          resource: { _tag: "attachment", attachmentId: upload.attachmentId },
        }),
      ),
    ).toMatchObject({ _tag: "AssetAttachmentNotFoundError" });
  });

  it("refuses an upload of the wrong size, and keeps the signed token out of the error", async () => {
    const upload = await client.rpc.call("attachments.createUploadUrl", {
      name: "image.png",
      mimeType: "image/png",
      sizeBytes: png.byteLength,
    });
    const params = attachmentUploadUrlParams(upload.relativeUrl);
    const error = await client.routes
      .call("attachments.upload", { params, body: new Uint8Array(1) })
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(T3HttpError);
    expect((error as T3HttpError).status).toBe(400);
    expect((error as T3HttpError).path).not.toContain(params.token);
    expect((error as T3HttpError).message).not.toContain(params.token);
  });

  it("reads a thread's workspace files, with a nested path under the same token", async () => {
    const id = projectId(`project-${crypto.randomUUID()}`);
    await client.routes.call("projects.mutate", {
      body: {
        type: "project.create",
        commandId: commandId(`command-${crypto.randomUUID()}`),
        projectId: id,
        title: "Sample project",
        workspaceRoot: workspace,
      },
    });
    const thread = await client.threads.create({
      projectId: id,
      title: "Sample thread",
      modelSelection,
    });

    const image = await client.rpc.call("assets.createUrl", {
      resource: { _tag: "workspace-file", threadId: thread.id, path: "image.png" },
    });
    expect(image.imageDimensions).toEqual({ width: 1, height: 1 });
    expect(Buffer.from((await read(image.relativeUrl)).bytes)).toEqual(png);

    const page = await client.rpc.call("assets.createUrl", {
      resource: { _tag: "workspace-file", threadId: thread.id, path: "page.html" },
    });
    const { token } = assetUrlParams(page.relativeUrl);
    const style = await client.routes.call("assets.read", {
      params: { token, path: "assets/style.css" },
    });
    expect(new TextDecoder().decode(style.bytes)).toBe("p { margin: 0 }");
    expect(style.contentType).toContain("text/css");

    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
    const { attachments } = await client.rpc.call("assets.persistChatAttachments", {
      threadId: thread.id,
      messageId: messageId(`message-${crypto.randomUUID()}`),
      attachments: [
        {
          type: "image",
          name: "image.png",
          mimeType: "image/png",
          sizeBytes: png.byteLength,
          dataUrl,
        },
      ],
    });
    const attachment = attachments[0];
    expect(attachment).toMatchObject({ type: "image", name: "image.png" });
    const persisted = await client.rpc.call("assets.createUrl", {
      resource: { _tag: "attachment", attachmentId: attachment?.id ?? "" },
    });
    expect(Buffer.from((await read(persisted.relativeUrl)).bytes)).toEqual(png);
  });

  it("reports an editor that is not installed with a typed record", async () => {
    const record = await refusal(
      client.rpc.call("shell.openInEditor", { cwd: workspace, editor: "rustrover" }),
    );
    expect(record).toMatchObject({
      _tag: "ExternalLauncherCommandNotFoundError",
      editor: "rustrover",
    });
  });

  it("opens an editor on a server whose PATH holds a stub of it", async () => {
    const tools = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3code-lib-editor-"));
    const marker = NodePath.join(tools, "opened");
    const stub = NodePath.join(tools, "rubymine");
    await NodeFSP.writeFile(stub, `#!/bin/sh\nprintf '%s' "$*" > '${marker}'\n`, { mode: 0o755 });
    const server = await startPeerServer({
      environment: { PATH: `${tools}${NodePath.delimiter}${process.env["PATH"] ?? ""}` },
    });
    try {
      await server.client.rpc.call("shell.openInEditor", { cwd: tools, editor: "rubymine" });
      const opened = await waitFor(
        () => NodeFSP.readFile(marker, "utf8").catch(() => undefined),
        "the stub editor",
        { timeoutMs: 20_000, intervalMs: 100 },
      );
      expect(opened).toContain(tools);
    } finally {
      await server.client.close();
      await server.stop();
      await NodeFSP.rm(tools, { recursive: true, force: true });
    }
  }, 120_000);
});
