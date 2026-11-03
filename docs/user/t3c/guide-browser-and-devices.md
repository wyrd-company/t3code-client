---
product: t3c
title: Browser tabs and devices
order: 44
relationships:
  references: [library, api]
---

# Browser tabs and devices

Open browser tabs, attach a viewer and control simulators and emulators.

## Browser tabs

`preview.*` keeps the browser tabs of a thread. A `desktop` tab is state that a desktop
client reports. A `server` tab runs in the environment's headless browser, which the
server installs on first use, and `T3Client.openPreviewViewer` attaches to it:

```ts
const tab = await client.rpc.call("preview.open", { threadId, url, runtime: "server" });
const viewer = await client.openPreviewViewer({ threadId, tabId: tab.tabId, maxWidth: 1280 });

viewer.send({ type: "takeControl" });
for await (const item of viewer) {
  if (item.kind === "decode-error") continue;
  const output = item.value;
  if (!("type" in output)) continue; // A message from a newer server.
  if (output.type === "frame") draw(output.bytes); // A JPEG image.
  if (output.type === "fileChooser") {
    await client.routes.call("previewStream.upload", {
      query: { threadId, tabId: tab.tabId, chooser: output.id },
      body: { files: [{ name: "notes.txt", mimeType: "text/plain", bytes }] },
    });
  }
  if (output.type === "download") {
    const { bytes } = await client.routes.call("previewStream.download", {
      query: { threadId, tabId: tab.tabId, id: output.id },
    });
  }
}
const { tabGone, reconnect, hostSetup } = await viewer.closed;
```

The server sends one frame and waits. The iterator tells the server to go on when you
ask for the next item, so a slow consumer gets only the newest frame. Keep reading
while you wait for a message.

Each viewer is its own socket. It does not reconnect by itself, and `client.close()`
does not end it. A `break` or `viewer.close()` does. `viewer.closed` names the reason:
the tab closed (`tabGone`), the server asks you to attach again (`reconnect`), or the host
needs a command before its browser can start (`hostSetup`). A session without
`preview:operate`, or a viewer with `interactive: false`, only watches: the server drops
what it sends, and its `control` messages have `canOperate: false`. Only the viewer in
control can answer a file picker.

`subscribePreviewEvents` follows every tab, and `subscribeDiscoveredLocalServers` the
listeners that the environment finds, which include other processes on that host. The
server stops only a listener that it attributes to a thread's terminal or agent, and
`preview.stopLocalServer` signals its whole process group, so it needs `terminal:operate`.

## Devices

`device.*` keeps the simulators and emulators of a server's device hosts. Device support
is off until `device.configure` turns it on. A host in settings can be this machine, an
SSH host, an EAS account or a Simlock pool, and `state.hosts` holds them all:

```ts
const state = await client.rpc.call("device.configure", { enabled: true });
const device = state.devices.find((item) => item.platform === "android");
if (device) {
  const target = { hostId: device.hostId, deviceId: device.id };
  await client.rpc.call("device.open", { ...target, threadId, platform: "android" });
  await client.rpc.call("device.action", { ...target, type: "setAppearance", value: "dark" });
  const { settings, foregroundApp } = await client.rpc.call("device.detail", target);
  await client.rpc.call("device.close", { ...target, threadId });
}
```

`subscribeDeviceState` sends the state, then each change. A reader can read it, and
`device.list` with `inspectOnly` reads what each host has installed. `retryHostId` and
`updateTool` can start or install tools, so they need `orchestration:operate`.
`device.testHost`, `device.easAccount` and `device.simlockIdentity` check a host or a
credential before settings hold it, and need `settings:write`. A failure has a tag from
`schemas.rpcErrors`, such as `DeviceHostUnavailableError`. `/api/device-hub/*` is the
server's proxy to a host's device hub. The library has no entry for it.
