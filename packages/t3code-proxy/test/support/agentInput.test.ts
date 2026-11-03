// ---
// relationships:
//   verifies: proxy
// ---
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { agentInputs, fileProblem, imageProblem } from "./agentInput.ts";

const ATTACHMENT = "attachment-1234";
const IMAGE = Buffer.from("sample image");
let home = "";
let attachments = "";

/** One line in the form that Codex writes. */
const userLine = (text: string, image?: Buffer, role = "user") =>
  JSON.stringify({
    timestamp: "2000-01-01T00:00:00.000Z",
    type: "response_item",
    payload: {
      type: "message",
      role,
      content: [
        { type: "input_text", text },
        ...(image
          ? [
              {
                type: "input_image",
                image_url: `data:image/png;base64,${image.toString("base64")}`,
                detail: "high",
              },
            ]
          : []),
      ],
    },
  });

const imageText = `— Sent by Alice\n\n[Attached image "sample.png" is saved at: /files/${ATTACHMENT}.png]`;

const write = (relative: string, ...lines: string[]) => {
  const path = NodePath.join(home, relative);
  NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
  NodeFS.writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
};
const SESSION = "sessions/2000/01/01/rollout-sample.jsonl";

beforeEach(() => {
  home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-proxy-agent-input-"));
  attachments = NodePath.join(home, "attachments");
  NodeFS.mkdirSync(attachments);
});
afterEach(() => NodeFS.rmSync(home, { recursive: true, force: true }));

it("finds the exact image in the input that names the attachment", async () => {
  write(
    SESSION,
    "not json",
    userLine("another message", Buffer.from("other")),
    userLine(imageText, IMAGE),
  );
  const inputs = await agentInputs(home, ATTACHMENT);
  expect(inputs).toHaveLength(1);
  expect(imageProblem(inputs, IMAGE)).toBeUndefined();
});

it("fails when the image bytes changed", async () => {
  write(SESSION, userLine(imageText, Buffer.from("changed image")));
  expect(imageProblem(await agentInputs(home, ATTACHMENT), IMAGE)).toBe("the image bytes differ");
});

it("fails when the input holds no image", async () => {
  write(SESSION, userLine(imageText));
  expect(imageProblem(await agentInputs(home, ATTACHMENT), IMAGE)).toBe("the input holds 0 images");
});

it("fails when any recorded input of the attachment differs", async () => {
  write(SESSION, userLine(imageText, IMAGE), userLine(imageText, Buffer.from("changed image")));
  expect(imageProblem(await agentInputs(home, ATTACHMENT), IMAGE)).toBe("the image bytes differ");
});

it("fails when no record names the attachment", async () => {
  write(SESSION, userLine("another message", IMAGE));
  expect(imageProblem(await agentInputs(home, ATTACHMENT), IMAGE)).toBe(
    "no recorded input names the attachment",
  );
  expect(fileProblem(await agentInputs(home, ATTACHMENT), attachments, "text")).toBe(
    "no recorded input names the attachment",
  );
});

it("does not take an assistant message as the agent's input", async () => {
  write(SESSION, userLine(imageText, IMAGE, "assistant"));
  await expect(agentInputs(home, ATTACHMENT)).resolves.toEqual([]);
});

it("does not take a line that names the attachment outside the message text", async () => {
  const line = JSON.parse(userLine("another message", IMAGE)) as Record<string, unknown>;
  write(SESSION, JSON.stringify({ ...line, metadata: ATTACHMENT }));
  await expect(agentInputs(home, ATTACHMENT)).resolves.toEqual([]);
});

it("takes only the response items of a session record", async () => {
  const line = JSON.parse(userLine(imageText)) as Record<string, unknown>;
  write(SESSION, JSON.stringify({ ...line, type: "event_msg" }));
  await expect(agentInputs(home, ATTACHMENT)).resolves.toEqual([]);
});

it("reads only session records under the sessions folder", async () => {
  write("archived/rollout-sample.jsonl", userLine(imageText, IMAGE));
  write("rollout-sample.jsonl", userLine(imageText, IMAGE));
  write("sessions/2000/01/01/other.jsonl", userLine(imageText, IMAGE));
  await expect(agentInputs(home, ATTACHMENT)).resolves.toEqual([]);
});

it("skips a record written before the proof started", async () => {
  const path = write(SESSION, userLine(imageText, IMAGE));
  NodeFS.utimesSync(path, new Date(1_000), new Date(1_000));
  await expect(agentInputs(home, ATTACHMENT, 2_000)).resolves.toEqual([]);
  await expect(agentInputs(home, ATTACHMENT, 500)).resolves.toHaveLength(1);
});

const fileText = (path: string) =>
  `Sample text\n\n— Sent by Sam\n\n[Attached file "sample.txt" is saved at: ${path}]`;

it("accepts a saved file with the expected content", async () => {
  const path = NodePath.join(attachments, `${ATTACHMENT}.txt`);
  NodeFS.writeFileSync(path, "text");
  write(SESSION, userLine(fileText(path)));
  expect(fileProblem(await agentInputs(home, ATTACHMENT), attachments, "text")).toBeUndefined();
});

it("fails when the file content changed", async () => {
  const path = NodePath.join(attachments, `${ATTACHMENT}.txt`);
  NodeFS.writeFileSync(path, "changed text");
  write(SESSION, userLine(fileText(path)));
  expect(fileProblem(await agentInputs(home, ATTACHMENT), attachments, "text")).toBe(
    "the file content differs",
  );
});

it("fails when the file path changed", async () => {
  const path = NodePath.join(home, `${ATTACHMENT}.txt`);
  NodeFS.writeFileSync(path, "text");
  write(SESSION, userLine(fileText(path)));
  expect(fileProblem(await agentInputs(home, ATTACHMENT), attachments, "text")).toBe(
    "the file path is not in the attachments",
  );
});

it("fails when the file does not exist", async () => {
  write(SESSION, userLine(fileText(NodePath.join(attachments, `${ATTACHMENT}.txt`))));
  expect(fileProblem(await agentInputs(home, ATTACHMENT), attachments, "text")).toBe(
    "the file does not exist",
  );
});

it("fails when the input gives no file path", async () => {
  write(SESSION, userLine(`Sample text for ${ATTACHMENT}`));
  expect(fileProblem(await agentInputs(home, ATTACHMENT), attachments, "text")).toBe(
    "the input gives no file path",
  );
});
