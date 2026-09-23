# t3code-client

TypeScript client library for the stock T3 Code server, published to npmjs as
`@wyrd-company/t3code-client`. Read `docs/design.md` before changing anything;
it is the contract every module is built against. `docs/testing.md` explains
unit and live tests, and `docs/releasing.md` explains releases.

## Layout

- `src/schemas/` zod mirrors of upstream `packages/contracts/src`.
- `src/wire/` the RPC envelope protocol.
- `src/transport/` HTTP and WebSocket transports and the RPC connection.
- `src/rpc/` the typed method registry and client.
- `src/auth/` credential store and auth control plane client.
- `src/api/` facades composed by `T3Client`.
- `src/internal/` small helpers with no T3 knowledge.
- `test/support/` fake server used by unit tests. `test/live/` real-server tests.
- `scripts/release/` shell steps the release workflows run.

## Reference source

The library targets the T3 Code release pinned as the `t3` devDependency.
Upstream is `pingdotgg/t3code`; read the source at that release's tag
(`vX.Y.Z`). Contracts: `packages/contracts/src/*.ts`. Server RPC handlers:
`apps/server/src/ws.ts`. Scope per method:
`apps/server/src/auth/RpcAuthorization.ts`.

## Conventions

The code follows upstream T3 Code's conventions so it reads like part of that
codebase.

- ESM, `NodeNext` resolution. Relative imports end in `.ts`; the build
  rewrites them to `.js`.
- camelCase file names. Tests are colocated as `*.test.ts` and import from
  `vite-plus/test`.
- Node built-ins are namespace imports with canonical aliases:
  `import * as NodePath from "node:path"`, `NodeFSP` for `node:fs/promises`.
- No TypeScript-only runtime syntax (`erasableSyntaxOnly`): declare fields
  instead of constructor parameter properties.
- No file over about 300 lines. Split by concern, not by size alone.
- Every object schema is `z.looseObject`. Growing literal sets use the
  forward-compatible helpers in `src/schemas/common.ts`.
- Every thrown error is a `T3Error` subclass from `src/errors.ts`.
- No `any`. `unknown` at the edges, narrowed by schemas.
- No shelling out from library code. Test harnesses may spawn the server.
- Public API is exported only from `src/index.ts`.
- Example and test values are generic: no real hostnames, users, or repos.
- Commits follow Conventional Commits, as upstream does.
- A change a consumer can notice carries an Intentional intent
  (`intentional add`). Never edit the version in `package.json` or
  `CHANGELOG.md` by hand.
- Run `task check` before handing work back.
