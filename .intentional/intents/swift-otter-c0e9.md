---
t3c-docs: patch
t3code-cli: patch
t3code-lib: minor
---

Add the remaining T3 Code 0.1.7 fields: one-time scheduled tasks (`{ type: "once", runAt }`, capability `oneTimeSchedules`), settings `hiddenThreadTags`, `hideTaggedThreads` and `usageModelFilter`, a usage `modelFilter` on `server.getUsageSummary` input and result, turn usage `models`, `localCommand` and `otherUsage`, and the select descriptor `role: "reasoning"`. Credential settings (`managementKey`, EAS `accessToken`) accept a secret provider reference (`SettingsSecretValue`), and the socket declares `clientCapabilities=settingsSecretReferences` so that settings show references as written. `t3c schedule show` prints a one-time trigger.
