---
relationships:
  references: [command-line, command-contract, output-contract, testing, releasing]
---

# Command composition

`src/cli.ts` loads the generated canonical command surface and invokes `main`.
`src/registration.ts` registers every leaf, positional argument and option from
`specifications/assets/cli-surface.json`. Build copies that file to
`commandSurface.json` at the package root; the copy is generated and packed.
Change the canonical asset when changing the contract. Do not edit its copy.

`main(argv, surface, sink, handlers)` accepts handlers keyed by full command
path, for example `auth pair` or `thread read`. A handler receives positional
arguments, the selected commander command, and an `Invocation`. Use
`command.optsWithGlobals()` for command options. Auth owns its handler module
and four auth paths. Execution owns its handler modules and run/thread/project/
server paths. Each adds its handler map to the composition root. The scaffold
owns registration, global options, version and the shared modules. Missing
handlers fail explicitly; help registration does not prove implementation.

`Invocation` owns `profiles`, lazy `resolve()` and `client()`, `output`, elapsed
start time, and operation `errorContext`. `client()` supplies a 30-second
`openTimeoutMs`, or the selected `--connect-timeout`. Client resources close in
`main`'s finally path. Credential-store failures retain local context; transport
failures use connection context. Set context for dispatch and run deadline
operations so the common mapping remains method-specific. Successful profile
resolution and cached resolution/client access preserve the caller context.
Overlapping first calls share one in-flight initialization per method. Failed
initialization clears its cached promise so a later call can retry. First client
creation changes the initial local context to connection and retains any
handler-selected dispatch/deadline context. Failed profile resolution
or credential backend operations select local context for that failure. Exact named profile
lookup maps not_found to 10; switch/logout preconditions map to 2.

Handlers finish exactly once through `Output.finish()`. Execution handlers use
`ExecutionResult`; inspection handlers use `{data, exitCode, error?}` plus their
text representation. `Output.delta()` emits text or assistantDelta JSON events;
`event()` emits other JSON stream events. The final streaming event has type
`result`. Retain known ids in execution failures. A handler that catches an error
after dispatch must finish with those ids; the outer boundary can only supply
null ids for errors before dispatch. Never retry ambiguous launches blindly.

`Output.progress()` uses stderr. Library diagnostics emit the diagnostic level
without raw payloads. Final failure prose is fixed and short. Handlers must not
pass credentials to progress, result data or events. The main process returns
the output's exit code; 124 is never used. Bare root/group invocations print
usage help on stderr in text mode before the final usage-error line. JSON mode
keeps one error object on stdout and the short final line on stderr. Explicit
`--help` prints help on stdout and exits successfully.

The scaffold owns `scripts/shrinkwrap.mjs`, which resolves dependencies through
npm using the local built library tarball, records its integrity and replaces
only its local URL with its registry URL and actual package version. The saved
lock retains registry versions for other dependencies. Prepack regenerates it;
`task cli:shrinkwrap` regenerates it explicitly. Release plumbing owns the final
release handoff and can call this interface after Intentional applies versions.
The CLI and library tarballs are installed together for consumer validation.
There is no need for a published zero-version library.

Root Taskfile verbs cover both packages. The scaffold owns `cli:build`,
`cli:test`, `cli:test:live`, `cli:acceptance`, `cli:shrinkwrap` and `cli:package`.
Auth and execution extend tests under the existing unit/live patterns; release
plumbing adds its documentation/demo/distribution targets without replacing the
shared verbs. Commands use the library; only development scripts spawn tools.
