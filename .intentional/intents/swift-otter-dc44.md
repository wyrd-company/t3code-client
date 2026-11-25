---
t3code-lib: major
---

A `secrets.answerRequest` save can carry one `secret` or a `values` map keyed by the card's `fields`. After checking `answer.type === "save"`, check `typeof answer.secret === "string"` before using it as a single value. Send `{ type: "save", values }` when answering a multi-field card. `schemas.serverActions.SecretRequestAnswerInput.shape.answer` is now a plain union with two save variants. Compose it as a union and distinguish the save shapes by their fields.
