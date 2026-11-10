---
product: t3c
title: Provider sign-in and install
order: 45
relationships:
  references: [library, api]
---

# Provider sign-in and install

Sign a provider in, install it and use the ACP registry.

## Provider sign-in

An instance with a sign-in controller, such as a managed Codex instance, signs in
through the server. These methods need `providers:manage`. Any other instance
refuses with `ProviderSetupError`.

```ts
const instanceId = schemas.common.providerInstanceId("managed-codex");
const { flowId } = await client.rpc.call("provider.auth.start", { instanceId });

for await (const item of client.rpc.stream("provider.auth.subscribe", { instanceId })) {
  if (item.kind !== "item") continue;
  if (item.value.phase === "waiting") console.log(item.value.authorizationUrl);
  if (["succeeded", "failed", "cancelled"].includes(item.value.phase)) break;
}
```

A person opens the URL. If the browser cannot reach the server's callback, pass the
address it ended on to `provider.auth.complete`, with the `flowId`. An interaction
that needs an answer goes to `provider.auth.respond`. `provider.auth.cancel` ends a
flow and `provider.auth.logout` signs the instance out and stops its sessions.
`provider.auth.removeMethod` forgets one saved method of the instance, such as an
incomplete ChatGPT connection. Only a method whose `canRemove` is true can go; the
server refuses others with `ProviderSetupError`.

`provider.chatgpt.handoff.subscribe` runs a sign-in for another environment. The
`profile` of its `finished` item holds live tokens, so handle it as a credential and
pass it to `provider.chatgpt.import-profile` on that environment.

`provider.consumeResetCredit` spends a banked credit of the account, for an instance
or for an account in a usage limit source. `provider.uploadFeedback` sends feedback on
a thread's running provider session to that provider, and needs `orchestration:operate`.

## Provider install and the ACP registry

`provider.install.start` downloads a managed provider's executable into the server's
home, and `provider.install.subscribe` reports its progress. A server that finds a
usable executable on its `PATH` reports `succeeded` and downloads nothing.
`provider.install.cancel` takes the `operationId` of the install, and
`provider.install.remove` removes the managed executable. A failure is a
`ProviderSetupError`.

`server.searchAcpRegistry` reads the public registry index.
`server.prepareAcpRegistryAgent` installs an agent on the server's host, and can use
the host's package manager. An instance with the `acpRegistry` driver runs an agent
from the registry, or a local command:

```ts
const instanceId = schemas.common.providerInstanceId("sample-agent");
const input = { instanceId, projectId };

const { sessions } = await client.rpc.call("server.listAcpRegistrySessions", input);
const { threadId } = await client.rpc.call("server.importAcpRegistrySession", {
  ...input,
  sessionId: sessions[0].sessionId,
});
```

The server probes an agent in the background, so a method can refuse until the
instance's snapshot reports the capability. A session with an imported thread refuses
`server.deleteAcpRegistrySession`: delete the thread first.
`server.setAcpRegistryProvider` sends `headers` to the agent, and no method returns
them. A failure is an `AcpRegistryOperationError`, whose `reason` names the cause.
