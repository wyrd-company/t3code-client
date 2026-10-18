---
relationships:
  verifies: mcp
---

# Deterministic response validator

Source: [r-huijts/mcp-server-tester](https://github.com/r-huijts/mcp-server-tester/tree/1a6d95de73e0c0fe118ef15132bc2e921437d723), commit `1a6d95de73e0c0fe118ef15132bc2e921437d723`, MIT.

Copied `src/validator/ResponseValidator.ts`, its tests, the validator-facing types
from `src/types/index.ts`, and `LICENSE`. The LLM generator, Anthropic client,
reporter, SDK transport wrapper and executable are excluded by the implementation
contract. This code is test-only and is not in the published package.

Adaptations: camelCase filenames; `.ts` imports; explicit type imports;
`unknown` and narrowed record indexing in place of `any`; optional rule targets;
Vite+ test imports and `vi.fn` in place of Jest. Formatting follows the workspace.
All six rule kinds, bracket/dot lookup, missing-data behavior and success/error
validation remain in the validator. The source's nine regression cases are retained.
The protocol runner normalizes MCP results to the validator's `ToolResponse`.

Preservation audit: `validateResponse` retains expected status and rule processing;
`validateRules` retains contains/matches/hasProperty/equals/arrayLength/custom;
`validateContains` retains string and array inclusion; `validateMatches` retains
slash-delimited regular expressions and JSON equality; `validateHasProperty`
retains existence checks; `validateEquals` retains JSON equality;
`validateArrayLength` retains exact lengths; `getValueByPath` and `parsePath`
retain bracket and dot traversal. Each symbol is in `responseValidator.ts`.
Types used only by generation, reporting or transport are excluded. No runtime
state or environment is copied. The retained test suite checks these contracts.
