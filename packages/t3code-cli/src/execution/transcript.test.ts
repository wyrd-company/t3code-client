// ---
// relationships:
//   verifies: command-contract
// ---
import { afterEach, expect, it, vi } from "vite-plus/test";
import { T3Client, T3HttpError, T3NotFoundError, threadId } from "@wyrd-company/t3code-lib";
import {
  at,
  items,
  makeProjection,
  makeSnapshot,
  makeTurnItem,
} from "../../../t3code-lib/test/support/threadFixtures.ts";
import { lastAssistantMessage, readConversation } from "./transcript.ts";

const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
afterEach(() => vi.restoreAllMocks());
const projection = makeProjection({
  visibleTurnItems: [
    makeTurnItem("user_message", {
      createdBy: "user",
      creationSource: "web",
      messageId: "message-1",
      inputIntent: "prompt",
      text: "Question",
      attachments: [],
    }),
    items.assistantMessage("First", false),
    makeTurnItem("reasoning", { text: "private reasoning", streaming: false }),
    items.assistantMessage("Last", false),
  ].map((item, position) => ({
    position,
    visibility: position === 0 ? "inherited" : "local",
    sourceThreadId: "source-thread",
    sourceItemId: `item-${position}`,
    item,
  })),
});
const transcript = {
  threadId: threadId("sample"),
  title: "Sample",
  updatedAt: at,
  items: projection.visibleTurnItems,
};

it("reads the visible conversation in server order and selects the last assistant message", async () => {
  const read = vi.spyOn(client.threads, "transcript").mockResolvedValue(transcript);
  const detail = vi.spyOn(client.threads, "detail");
  const signal = new AbortController().signal;
  const conversation = await readConversation(client, "sample", signal);
  expect(conversation).toEqual([
    { role: "user", kind: "user_message", text: "Question" },
    { role: "assistant", kind: "assistant_message", text: "First" },
    { role: "assistant", kind: "assistant_message", text: "Last" },
  ]);
  expect(read).toHaveBeenCalledWith("sample", signal);
  expect(detail).not.toHaveBeenCalled();
  expect(lastAssistantMessage(conversation)).toBe("Last");
  expect(lastAssistantMessage([])).toBeNull();
  expect(lastAssistantMessage([{ role: "assistant", kind: "assistant_message", text: "" }])).toBe(
    "",
  );
});
it("falls back only for the typed oversized refusal and derives the same visible conversation", async () => {
  const read = vi.spyOn(client.threads, "transcript").mockResolvedValue(transcript);
  const expected = await readConversation(client, "sample");
  read.mockRejectedValue(
    new T3HttpError("sample", {
      status: 400,
      method: "GET",
      path: "/",
      body: null,
      reason: "thread_transcript_too_large",
    }),
  );
  const detail = vi.spyOn(client.threads, "detail").mockResolvedValue(makeSnapshot(projection, 1));
  const signal = new AbortController().signal;
  expect(await readConversation(client, "sample", signal)).toEqual(expected);
  expect(detail).toHaveBeenCalledWith("sample", signal);
});
it.each([
  new T3HttpError("sample", { status: 500, method: "GET", path: "/", body: null, reason: "other" }),
  new T3NotFoundError("sample", { status: 404, method: "GET", path: "/", body: null }),
  new Error("thread_transcript_too_large"),
])("preserves other failures without a detail retry: %s", async (error) => {
  vi.spyOn(client.threads, "transcript").mockRejectedValue(error);
  const detail = vi.spyOn(client.threads, "detail");
  await expect(readConversation(client, "sample")).rejects.toBe(error);
  expect(detail).not.toHaveBeenCalled();
});
