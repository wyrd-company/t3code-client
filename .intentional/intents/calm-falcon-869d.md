---
t3code-client: minor
---

Target T3 Code 0.0.46 (orchestration protocol 2). The schemas, RPC registry, and facades now mirror the V2 orchestration contract: threads carry runs and turn items instead of session turns and activities, a turn is one run, commands are dispatched as OrchestrationV2Command over the socket only, projects are mutated through projects.mutate, the shell snapshot carries archived threads, the socket upgrade and orchestration HTTP routes name protocol 2, and auth decodes the granular permissions. New: threads.launch, threads.projection, threads.historyPage, threads.stop, threads.setModelSelection, shell.archivedSnapshot, shell.watchArchived, projects.snapshot. Removed by the server: shell.readModel, the HTTP dispatch fallback, the reasoningMessages opt-in, and thread.turn.start bootstrap (use threads.launch).
