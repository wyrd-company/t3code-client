---
t3code-lib: minor
---

Target stock T3 Code 0.1.11 with orchestration protocol 2. Use the typed issue and tracker RPCs and thread issue commands, renew a proof-bound pairing session with auth.renewAccessToken, and open a loopback preview port with openPreviewTunnel. Relay configuration on 0.1.11 requires relay:configure. Settings, pull request, speech, signed asset and orchestration contracts track the release.

Use `AuthCreatePairingCredentialInput.safeExtend()` when extending the pairing schema so the peer-link access check is preserved. Build derived schemas from `.shape` for projections that previously used `.pick()`, `.omit()`, or `.partial()`.
