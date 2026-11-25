---
t3code-lib: minor
---

Read optional `repositories` patches from `threads.diff`, including when the thread folder has no Git checkpoint. `diff` contains the thread folder's patch. When calling `latestDiffTurnCount` with a subset of the projection, include `checkpointScopes` to select the completed run's checkpoint when only tracked repositories have patches.
