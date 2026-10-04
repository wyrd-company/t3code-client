# Changelog

## 0.3.0

### Features

- Target T3 Code 0.0.44: the client is verified against 0.0.44; the release changes no wire contract the client mirrors.

## 0.2.0

### Features

- Target T3 Code 0.0.43: mirror its schema changes (reasoning message role, thread.auto-settle.set command and event, autoSettleDisabledAt, monogram project icons, requireWorktree bootstrap, permission approvals, 100-attachment cap, new provider and environment fields). Add an opt-in reasoningMessages option to threads.watch, threads.detail, and threads.startTurn, off by default. A Lucide project icon that carries monogram text now decodes as `kind: "monogram"`; consumers that switch only on `lucide` and `emoji` must handle it.

## 0.1.0

### Features

- Publish `@wyrd-company/t3code-client` to npmjs: a TypeScript client for the stock T3 Code server covering the HTTP API, WebSocket RPC, and the auth control plane, tested against T3 Code 0.0.42.
