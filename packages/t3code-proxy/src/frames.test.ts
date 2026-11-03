// ---
// relationships:
//   verifies: proxy
// ---
import { describe, expect, it } from "vite-plus/test";
import { ATTACHMENT_ONLY_PLACEHOLDER as PLACEHOLDER } from "./byline.ts";
import { rewriteFrame } from "./frames.ts";

const DISPATCH = "orchestration.dispatchCommand";
const LAUNCH = "orchestration.launchThread";
const identity = { name: "Alice", names: ["Alice", "Sam", "Samira"] };
const request = (tag: string, payload: unknown) => ({
  _tag: "Request",
  id: "1",
  tag,
  payload,
  headers: [],
});
const dispatch = (text: string, more: object = {}) =>
  request(DISPATCH, { type: "message.dispatch", text, ...more });
const edit = (text: string) => request(DISPATCH, { type: "queued-run.edit", text });
const launch = (text: string) => request(LAUNCH, { initialMessage: { text } });

const payload = (frame: unknown) => {
  const { text } = rewriteFrame(JSON.stringify(frame), identity);
  expect(text).toBeDefined();
  return (JSON.parse(text!) as { payload: { text: string; initialMessage: { text: string } } })
    .payload;
};
const unchanged = (frame: string) => {
  const result = rewriteFrame(frame, identity);
  expect(result.text).toBeUndefined();
  return result;
};

describe("rewrite table", () => {
  it("stamps message.dispatch", () => {
    expect(payload(dispatch("hi")).text).toBe("hi\n\n— Sent by Alice");
  });
  it("stamps queued-run.edit", () => {
    expect(payload(edit("hi")).text).toBe("hi\n\n— Sent by Alice");
  });
  it("stamps launchThread.initialMessage", () => {
    expect(payload(launch("hi")).initialMessage.text).toBe("hi\n\n— Sent by Alice");
  });
  it("keeps a change when a later request in the batch has none", () => {
    const frame = JSON.stringify([dispatch("a"), dispatch("/compact")]);
    const parsed = JSON.parse(rewriteFrame(frame, identity).text!) as {
      payload: { text: string };
    }[];
    expect(parsed.map((request) => request.payload.text)).toEqual([
      "a\n\n— Sent by Alice",
      "/compact",
    ]);
  });
  it("names the command for the log, with no text", () => {
    const frame = JSON.stringify([dispatch("secret"), edit("secret"), launch("secret")]);
    expect(rewriteFrame(frame, identity).commands).toEqual([
      `${DISPATCH} message.dispatch`,
      `${DISPATCH} queued-run.edit`,
      LAUNCH,
    ]);
  });
  it("keeps all other fields", () => {
    const result = payload(dispatch("hi", { threadId: "t", attachments: [{ id: "a" }] }));
    expect(result).toMatchObject({ threadId: "t", attachments: [{ id: "a" }] });
  });
  it("stamps each request in a batched frame", () => {
    const frame = JSON.stringify([{ _tag: "Ping" }, dispatch("a"), launch("b")]);
    const parsed = JSON.parse(rewriteFrame(frame, identity).text!) as [
      unknown,
      { payload: { text: string } },
      { payload: { initialMessage: { text: string } } },
    ];
    expect(parsed[0]).toEqual({ _tag: "Ping" });
    expect(parsed[1].payload.text).toBe("a\n\n— Sent by Alice");
    expect(parsed[2].payload.initialMessage.text).toBe("b\n\n— Sent by Alice");
  });
});

describe("the placeholder in each table row", () => {
  it.each([
    ["message.dispatch", () => payload(dispatch(PLACEHOLDER)).text],
    ["queued-run.edit", () => payload(edit(PLACEHOLDER)).text],
    ["launchThread", () => payload(launch(PLACEHOLDER)).initialMessage.text],
  ])("%s becomes the byline alone", (_name, read) => {
    expect(read()).toBe("— Sent by Alice");
  });
  it("keeps the Ultrathink prefix in each row", () => {
    const text = `Ultrathink:\n${PLACEHOLDER}`;
    expect(payload(dispatch(text)).text).toBe("Ultrathink:\n— Sent by Alice");
    expect(payload(edit(text)).text).toBe("Ultrathink:\n— Sent by Alice");
    expect(payload(launch(text)).initialMessage.text).toBe("Ultrathink:\n— Sent by Alice");
  });
  it("a queue edit with the placeholder and an earlier byline becomes the byline alone", () => {
    expect(payload(edit(`${PLACEHOLDER}\n\n— Sent by Sam`)).text).toBe("— Sent by Alice");
  });
});

describe("queue edits", () => {
  it("replaces the earlier name with the editor's name", () => {
    expect(payload(edit("hi\n\n— Sent by Sam")).text).toBe("hi\n\n— Sent by Alice");
  });
  it("keeps text after the byline", () => {
    expect(payload(edit("hi\n\n— Sent by Sam more")).text).toBe("hi more\n\n— Sent by Alice");
  });
  it("keeps a quoted byline", () => {
    expect(payload(edit("Quote:\n\n— Sent by Sam\n\n— Sent by Samira")).text).toBe(
      "Quote:\n\n— Sent by Sam\n\n— Sent by Alice",
    );
  });
  it("uses the longest name that shares a prefix", () => {
    expect(payload(edit("hi\n\n— Sent by Samira")).text).toBe("hi\n\n— Sent by Alice");
  });
  it("a stored byline alone stays the byline alone", () => {
    expect(payload(edit("— Sent by Sam")).text).toBe("— Sent by Alice");
  });
  it("an edit that becomes a slash command has no byline", () => {
    expect(payload(edit("/compact\n\n— Sent by Sam")).text).toBe("/compact");
  });
  it("a new message keeps a quoted byline", () => {
    expect(payload(dispatch("hi\n\n— Sent by Sam")).text).toBe(
      "hi\n\n— Sent by Sam\n\n— Sent by Alice",
    );
  });
});

describe("byte-identical frames", () => {
  const spaced = (frame: unknown) => JSON.stringify(frame, null, 1);
  it.each([
    ["a frame that is not JSON", "not json"],
    ["a request with no text", JSON.stringify(request("server.getConfig", {}))],
    ["a frame with other spacing and no change", spaced(request("server.getConfig", {}))],
    ["a slash command", spaced(dispatch("/compact"))],
    ["a launch slash command", spaced(launch("/compact"))],
    ["a queue edit that already matches", spaced(edit("hi\n\n— Sent by Alice"))],
    ["a guest message", spaced(dispatch("hi", { guestMessageId: "g" }))],
    ["another command with text", spaced(request(DISPATCH, { type: "other", text: "hi" }))],
    ["a text field that is not a string", spaced(dispatch("x", { text: 1 }))],
    ["a launch with no message", spaced(request(LAUNCH, {}))],
    ["a launch with no text", spaced(request(LAUNCH, { initialMessage: {} }))],
    [
      "a frame that is not a request",
      spaced({ _tag: "Exit", tag: DISPATCH, payload: { type: "message.dispatch", text: "hi" } }),
    ],
    ["a request with no payload", spaced({ _tag: "Request", tag: DISPATCH })],
    ["a JSON scalar", "1"],
    ["JSON null", "null"],
    ["a batch with no change", spaced([{ _tag: "Ping" }, dispatch("/compact")])],
  ])("%s", (_name, frame) => {
    unchanged(frame);
  });
  it("logs a guest message and a slash command without changing them", () => {
    expect(unchanged(JSON.stringify(dispatch("/compact"))).commands).toEqual([
      `${DISPATCH} message.dispatch`,
    ]);
  });
});
