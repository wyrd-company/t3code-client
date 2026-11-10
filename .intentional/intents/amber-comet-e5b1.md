---
t3c-docs: patch
t3code-lib: minor
---

Live transcription of T3 Code 0.1.8: `T3Client.openSpeechStream` opens `/ws/voice` with a media ticket and `orchestration:operate`, sends the recognition options, then `sendAudio` sends 16 kHz mono Float32 PCM (at most `SPEECH_STREAM_MAX_CHUNK_BYTES` in one call) and `finish` asks for the final text. The stream yields `ready`, `update`, `finished` and `error` events, and `closed` gives the close code. `schemas.speechStream` holds the socket messages. `WebSocketLike.send` also takes bytes, so a custom `webSocket` must send binary messages.
