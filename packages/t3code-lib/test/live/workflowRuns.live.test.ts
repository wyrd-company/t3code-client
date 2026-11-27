// ---
// relationships:
//   verifies: library-wire
// ---
/**
 * A durable workflow's whole life on the pinned server, with no agent: a webhook-triggered
 * definition, its hook path from `t3 workflow hooks`, a run started through the typed webhook
 * route, the question it asks on `workflows.subscribe`, the answer, and the completed result.
 */
import * as NodeChildProcess from "node:child_process";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { T3HttpError } from "../../src/index.ts";
import { webhookUrlParams } from "../../src/http/routes/webhooks.ts";
import {
  WebhookFailure,
  WorkflowHook,
  applyWorkflowRunsUpdate,
  type WorkflowRunsSnapshot,
} from "../../src/schemas/workflow.ts";
import { serverEnvironment } from "../support/serverEnvironment.ts";
import { serverBin } from "./globalSetup.ts";
import { connect, hasLiveServer, waitFor } from "./liveClient.ts";

const home = process.env["T3_LIVE_HOME"];
const name = "sample-hook.ts";
const subjectUrl = "https://example.test/work/1";
/**
 * Asks one question of each request to its hook and returns the answer with the request body.
 * Its hook's key cannot be read from a request whose body is `bad-key`, which the hook refuses.
 */
const hookWorkflow = `const { workflow, webhook, ask, subject, WebhookRequest } = T3;
const key = (request) => {
  if (request.body === "bad-key") throw new Error("no delivery id");
  return undefined;
};
workflow(
  "samplehook",
  { version: 1, payload: WebhookRequest, concurrency: 1, triggers: [webhook("in", { key })] },
  (request) => subject(${JSON.stringify(subjectUrl)}).pipe(
    Effect.andThen(ask("ship", { title: "Ship the sample?", choices: ["yes", "no"] })),
      Effect.map((answer) => ({
        body: request.body,
        choice: answer._tag === "Some" ? answer.value.choice : null,
      })),
    ),
);
`;

/** The hooks of the owned server, as the stock CLI lists them. */
function hooks(baseDir: string): WorkflowHook[] {
  const output = NodeChildProcess.execFileSync(
    process.execPath,
    [serverBin(), "workflow", "hooks", "--json", "--base-dir", baseDir],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: serverEnvironment() },
  );
  return WorkflowHook.array().parse(JSON.parse(output));
}

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("Expected the hook to refuse.");
    },
    (error: unknown) => {
      if (!(error instanceof T3HttpError)) throw error;
      return error;
    },
  );

describe.skipIf(!hasLiveServer || !home)("live workflow run", () => {
  const client = connect();
  afterAll(async () => {
    // A definition can be deleted only while the beta is on.
    const settings = (workflowsEnabled: boolean) =>
      client.rpc.call("server.updateSettings", { patch: { workflowsEnabled } });
    await settings(true).catch(() => undefined);
    await client.rpc.call("workflows.deleteDefinition", { name }).catch(() => undefined);
    await settings(false).catch(() => undefined);
    await client.close();
  });

  it("starts a run from its hook, asks, takes the answer and completes", async () => {
    // The beta is off by default; nothing but this test's request starts the sample.
    await client.rpc.call("server.updateSettings", { patch: { workflowsEnabled: true } });
    const saved = await client.rpc.call("workflows.saveDefinition", {
      name,
      source: hookWorkflow,
    });
    expect(saved).toEqual({ changed: true, problems: [] });
    const hook = await waitFor(
      async () => hooks(home ?? "").find((entry) => entry.workflow === "samplehook"),
      "the workflow's hook",
      { timeoutMs: 30_000 },
    );
    expect(hook.name).toBe("in");
    const params = webhookUrlParams(hook.path);
    expect(params.hookId.startsWith("wf-")).toBe(true);

    const lists = client.rpc
      .stream("workflows.subscribe", { changes: true })
      [Symbol.asyncIterator]();
    let list: WorkflowRunsSnapshot | undefined;
    const next = async () => {
      const item = await lists.next();
      if (item.done) throw new Error("The workflow list ended.");
      if (item.value.kind === "decode-error") throw item.value.error;
      list = applyWorkflowRunsUpdate(list, item.value.value);
      return list;
    };
    await next();

    const start = (body: string) =>
      client.routes.call("webhooks.webhookPost", {
        params,
        headers: { "content-type": "text/plain" },
        body: new TextEncoder().encode(body),
      });
    const started = await start("sample-body");
    expect(started).toEqual({ runId: expect.any(String) });
    const runId = (started as { runId: string }).runId;
    let current = list;
    while (!current?.questions.some((question) => question.runId === runId)) {
      current = await next();
    }
    const question = current.questions.find((entry) => entry.runId === runId);
    expect(question).toMatchObject({
      name: "ship",
      request: expect.objectContaining({ title: "Ship the sample?", choices: ["yes", "no"] }),
    });
    expect(current.runs.find((run) => run.runId === runId)).toMatchObject({
      workflow: "samplehook",
      status: "waiting",
    });
    const subject = { kind: "url", key: subjectUrl, address: { url: subjectUrl }, url: subjectUrl };
    expect(await client.rpc.call("workflows.about", { subject: subjectUrl })).toMatchObject({
      runs: [{ runId, subject }],
      questions: [{ runId, name: "ship" }],
    });
    expect(
      await client.rpc.call("workflows.about", { subject: "https://example.test/work/2" }),
    ).toEqual({ runs: [], questions: [] });

    const queued = (await start("queued-body")) as { runId: string };
    try {
      const queueStep = await waitFor(
        async () => {
          const detail = await client.rpc.call("workflows.get", { runId: queued.runId });
          return detail.steps.find((step) => step.kind === "queue" && step.ahead !== undefined);
        },
        "the workflow queue",
        { timeoutMs: 15_000 },
      );
      expect(queueStep).toMatchObject({ kind: "queue", ahead: 0 });
    } finally {
      await client.rpc.call("workflows.cancel", { runId: queued.runId });
    }

    await client.rpc.call("workflows.answer", { runId, name: "ship", choice: "yes" });
    while (current.questions.some((entry) => entry.runId === runId)) current = await next();
    await lists.return?.();
    const detail = await waitFor(async () => {
      const read = await client.rpc.call("workflows.get", { runId });
      return read.run.status === "completed" ? read : undefined;
    }, "the run to complete");
    expect(detail.run.result).toEqual({ body: "sample-body", choice: "yes" });
    expect(detail.run.subject).toMatchObject(subject);
    expect(detail.steps.find((step) => step.name === "ship")).toMatchObject({
      kind: "ask",
      status: "completed",
    });

    // A request the hook cannot key is invalid, with the problem in words.
    const invalid = await refusal(
      client.routes.call("webhooks.webhookPost", {
        params,
        body: new TextEncoder().encode("bad-key"),
      }),
    );
    expect(invalid).toMatchObject({ status: 400, reason: "invalid_request" });
    expect(WebhookFailure.parse(invalid.body)).toEqual({
      error: "invalid_request",
      problem: expect.stringContaining("no delivery id"),
    });
    // A wrong token reads as no hook, so the URL does not say which hooks exist.
    const wrong = await refusal(
      client.routes.call("webhooks.webhookPost", {
        params: { ...params, token: "sample-wrong-token" },
      }),
    );
    expect(wrong).toMatchObject({ status: 404, reason: "hook_not_found" });
    expect(WebhookFailure.parse(wrong.body)).toEqual({ error: "hook_not_found" });
  });
});
