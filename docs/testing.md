# Testing

## Unit tests

`pnpm run test` runs `src/**/*.test.ts`. The tests use
`test/support/fakeServer.ts`, an in-process `ws` server plus a fake `fetch`
that speak the same envelope protocol and HTTP routes as T3 Code. No network.

`test/fixtures/` holds payloads captured from a real server. The schema tests
decode them, so a fixture captured from a newer server shows where the schemas
have to change.

## Live tests

`pnpm run test:live` runs `test/live/**` against a real server.
`test/live/globalSetup.ts` starts the `t3` devDependency on a free loopback
port with its own data directory, issues a bearer token, and stops the server
when the run ends. The pinned `t3` version is the server release this library
targets, so the live suite is the check that the client still matches it.

| Variable          | Meaning                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `T3_LIVE_URL`     | base URL of a server to use instead of starting one              |
| `T3_LIVE_TOKEN`   | bearer token for that server (`t3 auth session issue`)           |
| `T3_LIVE_KEEP=1`  | keep the started server's data directory and log after the run   |
| `T3_LIVE_MODEL`   | optional, default `gpt-5.6-luna` on provider instance `codex`    |
| `T3_LIVE_AGENT=1` | also run tests that start a real agent turn (spends credit)      |
| `T3_LIVE_QUEUED`  | with `T3_LIVE_AGENT=1`, run the two-turn queued-message scenario |

Set both `T3_LIVE_URL` and `T3_LIVE_TOKEN` to test against a server you run
yourself; nothing is started then.

The agent tests need a configured provider on the server. They never run in
continuous integration.
