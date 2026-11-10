---
t3c-docs: patch
t3code-lib: minor
---

Voice routes of T3 Code 0.1.8: `client.routes` has the 14 `voice.*` routes (status, model catalog, download, select, cancel, remove, acceleration, unload timeout, local and cloud transcription, cloud keys, OpenRouter models, transcript cleanup); `schemas.speech` holds their types and `CloudSpeechError`. `encodeSpeechPcmRequest` frames a transcription body. The settings patch takes `cloudSpeechCredentials`, `speechModelId`, `speechAcceleration`, `speechModelUnloadTimeout`, `speechProjectCustomWords` (also per project) and `speechPostProcessingModelSelection`. Capabilities read `voiceTranscription` and `cloudVoiceTranscription`; the cloud link state reads `tunnelHostname` and `linkableHere`; request errors read reasons `invalid_audio`, `speech_unavailable` and `speech_busy`.
