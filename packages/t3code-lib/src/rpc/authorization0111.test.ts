import { describe, expect, it } from "vite-plus/test";
import { rpcMethods } from "./registry.ts";

const commandId = "command-1";
const threadId = "thread-1";
const model = {
  modelSelection: { instanceId: "sample-provider", model: "sample-model" },
  runtimeMode: "approval-required",
  interactionMode: "default",
};
const author = { createdBy: "user", creationSource: "cli" };
const logout = "  /LoGoUt  ";
const dispatch = rpcMethods["orchestration.dispatchCommand"];
const launch = rpcMethods["orchestration.launchThread"];
const grant = ["providers:manage"];

describe("stock 0.1.11 payload permissions", () => {
  it("requires provider management for an attachment-free logout on dispatch", () => {
    const message = {
      type: "message.dispatch",
      ...author,
      commandId,
      threadId,
      messageId: "message-1",
      text: logout,
      attachments: [],
      dispatchMode: { type: "start_immediately" },
    };
    const attachment = {
      type: "image",
      id: "image-1",
      name: "sample.png",
      mimeType: "image/png",
      sizeBytes: 12,
    };
    expect(dispatch.payloadScopes?.(dispatch.payload.parse(message))).toEqual(grant);
    expect(
      dispatch.payloadScopes?.(dispatch.payload.parse({ ...message, attachments: [attachment] })),
    ).toEqual([]);
    expect(
      dispatch.payloadScopes?.(dispatch.payload.parse({ ...message, text: "/logout sample" })),
    ).toEqual([]);
  });

  it("checks a queued edit with supplied attachments and a delegated task's prompt", () => {
    const edit = { type: "queued-run.edit", commandId, threadId, runId: "run-1", text: logout };
    expect(dispatch.payloadScopes?.(dispatch.payload.parse(edit))).toEqual([]);
    expect(dispatch.payloadScopes?.(dispatch.payload.parse({ ...edit, attachments: [] }))).toEqual(
      grant,
    );
    const delegated = dispatch.payload.parse({
      type: "delegated_task.request",
      ...author,
      ...model,
      commandId,
      parentThreadId: threadId,
      parentRunId: "run-1",
      parentNodeId: "node-1",
      task: logout,
    });
    expect(dispatch.payloadScopes?.(delegated)).toEqual(grant);
  });

  it("checks the initial message of a launch", () => {
    const input = {
      ...model,
      commandId,
      projectId: "project-1",
      title: "Sample thread",
      workspaceStrategy: { type: "root" },
    };
    expect(launch.payloadScopes?.(launch.payload.parse(input))).toEqual([]);
    expect(
      launch.payloadScopes?.(
        launch.payload.parse({ ...input, initialMessage: { text: logout, attachments: [] } }),
      ),
    ).toEqual(grant);
  });

  it("requires provider management for supplied secret references", () => {
    const reference = { provider: "sample", reference: "sample/token" };
    const eas = rpcMethods["device.easAccount"];
    const simlock = rpcMethods["device.simlockIdentity"];
    const models = rpcMethods["server.listTextGeneratorModels"];
    expect(eas.payloadScopes?.(eas.payload.parse({ accessToken: reference }))).toEqual(grant);
    expect(eas.payloadScopes?.(eas.payload.parse({ accessToken: "literal-token" }))).toEqual([]);
    expect(simlock.payloadScopes?.(simlock.payload.parse({ agentToken: reference }))).toEqual(
      grant,
    );
    expect(simlock.payloadScopes?.(simlock.payload.parse({}))).toEqual([]);
    const config = { kind: "openaiCompatible", baseUrl: "https://example.invalid" };
    const input = { id: "sample", config: { ...config, apiKey: reference } };
    expect(models.payloadScopes?.(models.payload.parse(input))).toEqual(grant);
    expect(models.payloadScopes?.(models.payload.parse({ id: "sample", config }))).toEqual([]);
  });
});
