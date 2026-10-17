import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeT3Server } from "../../test/support/fakeServer.ts";
import { ids } from "../../test/support/threadFixtures.ts";
import { T3RpcError } from "../errors.ts";
import { RpcClient } from "../rpc/client.ts";
import { rpcMethods } from "../rpc/registry.ts";
import { RpcConnection } from "../transport/rpcConnection.ts";
import { SocketTransport } from "../transport/socket.ts";
import { CommandDispatcher, isMissingResourceError } from "./dispatch.ts";

describe("CommandDispatcher", () => {
  let server: FakeT3Server;
  let connection: RpcConnection;
  let dispatcher: CommandDispatcher;
  let dispatched: unknown[];

  beforeEach(async () => {
    server = await FakeT3Server.start();
    dispatched = [];
    connection = new RpcConnection(new SocketTransport({ url: async () => server.wsUrl }));
    const rpc = new RpcClient(connection, rpcMethods);
    let counter = 0;
    dispatcher = new CommandDispatcher(rpc, {
      clock: { now: () => new Date("2020-01-01T00:00:10.000Z") },
      ids: () => `id-${++counter}`,
    });
    server.handle("orchestration.dispatchCommand", (payload) => {
      dispatched.push(payload);
      return { kind: "value", value: { sequence: 7 } };
    });
  });
  afterEach(async () => {
    await connection.close();
    await server.close();
  });

  it("sends a valid command over the socket and returns the receipt", async () => {
    const receipt = await dispatcher.dispatch({
      type: "thread.archive",
      commandId: dispatcher.newCommandId(),
      threadId: ids.threadId,
    });
    expect(receipt).toEqual({ sequence: 7 });
    expect(dispatched).toEqual([
      { type: "thread.archive", commandId: "id-1", threadId: ids.threadId },
    ]);
    expect(server.routes.requests).toEqual([]);
  });

  it("rejects an invalid command before anything is sent", async () => {
    await expect(
      dispatcher.dispatch({
        type: "thread.create",
        createdBy: "user",
        creationSource: "web",
        commandId: dispatcher.newCommandId(),
        threadId: ids.threadId,
        projectId: ids.projectId,
        title: "",
        modelSelection: { instanceId: "sample-provider" as never, model: "sample-model" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
      }),
    ).rejects.toMatchObject({ code: "precondition", message: /thread\.create is invalid: title/ });
    expect(dispatched).toEqual([]);
  });

  it("mints one fresh id per call and stamps the injected clock", () => {
    expect(dispatcher.newCommandId()).toBe("id-1");
    expect(dispatcher.newMessageId()).toBe("id-2");
    expect(dispatcher.newThreadId()).toBe("id-3");
    expect(dispatcher.newProjectId()).toBe("id-4");
    expect(dispatcher.now()).toBe("2020-01-01T00:00:10.000Z");
  });
});

describe("isMissingResourceError", () => {
  const dispatchError = (fields: Record<string, unknown>) =>
    new T3RpcError("orchestration.dispatchCommand", {
      _tag: "OrchestrationV2DispatchCommandError",
      commandId: "command-1",
      commandType: "thread.delete",
      message: "Command failed.",
      ...fields,
    });
  const mutationError = (fields: Record<string, unknown>) =>
    new T3RpcError("projects.mutate", {
      _tag: "ProjectMutationError",
      commandId: "command-1",
      message: "Mutation failed.",
      ...fields,
    });

  it.each([
    ["message says was not found", dispatchError({ message: "Thread 'x' was not found." })],
    ["message says does not exist", dispatchError({ message: "Thread 'x' does not exist." })],
    ["detail says not found", dispatchError({ detail: "Thread 'x' was not found." })],
    ["cause names NotFoundError", dispatchError({ cause: { _tag: "NotFoundError" } })],
    ["cause text says does not exist", dispatchError({ cause: "Project does not exist" })],
    ["project mutation message", mutationError({ message: "Project 'x' does not exist." })],
    ["project mutation cause", mutationError({ cause: { name: "NotFoundError" } })],
  ])("recognises a missing resource: %s", (_label, error) => {
    expect(isMissingResourceError(error)).toBe(true);
  });

  it.each([
    ["another dispatch failure", dispatchError({ message: "Thread 'x' is already archived." })],
    ["another mutation failure", mutationError({ message: "Project 'x' is not empty." })],
    [
      "an unrelated tag",
      new T3RpcError("vcs.status", { _tag: "GitCommandError", message: "was not found" }),
    ],
    ["not an RPC error", new Error("Thread was not found.")],
    ["undefined", undefined],
  ])("rejects: %s", (_label, error) => {
    expect(isMissingResourceError(error)).toBe(false);
  });
});
