// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";
import { makeShellSnapshot } from "../../../test/support/threadFixtures.ts";
import { OrchestrationMessageContext, ResponseContextRecord } from "./messageContext.ts";
import { OrchestrationV2ShellHttpSnapshot, OrchestrationV2ShellResumeAnswer } from "./shellHttp.ts";

const citation = {
  version: 1,
  environmentId: "environment-1",
  threadId: "thread-1",
  messageId: "message-1",
  text: "Sample answer",
  start: 0,
  end: 13,
  prefix: "",
  suffix: " and more",
};
const record = {
  version: 1,
  contextId: "context-1",
  label: "Reply",
  kind: "response",
  citation,
  itemId: "item-1",
  subagents: [{ threadId: "thread-2", title: "Sample child", environmentId: "environment-2" }],
};

describe("response context record of 0.1.10", () => {
  it("reads a reply to an earlier assistant response", () => {
    expect(ResponseContextRecord.parse(record)).toEqual(record);
    const context = OrchestrationMessageContext.parse({ version: 1, records: [record] });
    expect(context.records).toEqual([record]);
  });

  it("refuses a citation that ends before it starts or quotes only whitespace", () => {
    expect(
      ResponseContextRecord.safeParse({ ...record, citation: { ...citation, end: 0 } }).success,
    ).toBe(false);
    expect(
      ResponseContextRecord.safeParse({ ...record, citation: { ...citation, text: "  " } }).success,
    ).toBe(false);
  });

  it("drops a malformed response record rather than reading it as an unknown kind", () => {
    const context = OrchestrationMessageContext.parse({
      version: 1,
      records: [{ ...record, citation: undefined }],
    });
    expect(context.records).toEqual([]);
  });
});

describe("shell snapshot over HTTP in 0.1.10", () => {
  it("reads the project identities digest of a snapshot", () => {
    const snapshot = { ...makeShellSnapshot({}), projectIdentities: "digest-1" };
    expect(OrchestrationV2ShellHttpSnapshot.parse(snapshot).projectIdentities).toBe("digest-1");
    expect(
      OrchestrationV2ShellHttpSnapshot.safeParse({ ...snapshot, projectIdentities: 1 }).success,
    ).toBe(false);
  });

  it("answers a resume with either `resumable` or a snapshot", () => {
    expect(OrchestrationV2ShellResumeAnswer.parse({ resumable: true })).toEqual({
      resumable: true,
    });
    const snapshot = makeShellSnapshot({ snapshotSequence: 9 });
    expect(OrchestrationV2ShellResumeAnswer.parse(snapshot)).toMatchObject({ snapshotSequence: 9 });
    expect(OrchestrationV2ShellResumeAnswer.safeParse({ resumable: false }).success).toBe(false);
  });
});
