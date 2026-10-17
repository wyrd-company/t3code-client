// ---
// relationships:
//   verifies: command-contract
//   references: testing
// ---
import { randomUUID } from "node:crypto";
import { expect, it } from "vite-plus/test";
import { commandId, messageId, providerInstanceId, T3HttpError } from "@wyrd-company/t3code-lib";
import { agent, cli, client, ownedThreads, record, useDispatchHarness } from "./dispatchHarness.ts";

useDispatchHarness("large-transcript");

it.skipIf(!agent)("recovers a real oversized transcript through the detail route", async () => {
  const { projectId } = await client.projects.ensureScratch();
  const thread = await client.threads.create({
    projectId,
    title: "Sample large transcript",
    modelSelection: { instanceId: providerInstanceId("codex"), model: "gpt-6-luna" },
  });
  ownedThreads.add(thread.id);
  // Stock protocol's defer_start records a real user message and preparing run
  // without sending 51 MiB to a model. No storage edits or server patches.
  const text = `SAMPLE-BEGIN\n${"x".repeat(51 * 1024 * 1024)}\nSAMPLE-END`;
  const receipt = await client.threads.dispatch({
    type: "message.dispatch",
    commandId: commandId(randomUUID()),
    messageId: messageId(randomUUID()),
    threadId: thread.id,
    createdBy: "user",
    creationSource: "web",
    text,
    attachments: [],
    dispatchMode: { type: "defer_start" },
  });
  let refusal: unknown;
  try {
    await client.threads.transcript(thread.id);
  } catch (error) {
    refusal = error;
  }
  record({
    case: "stock transcript refusal",
    threadId: thread.id,
    receipt,
    refusal:
      refusal instanceof T3HttpError
        ? { reason: refusal.reason, status: refusal.status, message: refusal.message }
        : String(refusal),
  });
  expect(refusal).toBeInstanceOf(T3HttpError);
  expect((refusal as T3HttpError).reason).toBe("thread_transcript_too_large");
  const result = await cli(["thread", "read", thread.id, "--json"]);
  expect(result.exit).toBe(0);
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  const value = JSON.parse(result.stdout);
  expect(value).toEqual({ data: [{ role: "user", kind: "user_message", text }], exitCode: 0 });
  record({
    case: "real detail recovery",
    threadId: thread.id,
    inputBytes: Buffer.byteLength(text),
    stdoutBytes: Buffer.byteLength(result.stdout),
    exit: result.exit,
  });
});
