#!/usr/bin/env bash
# ---
# relationships:
#   implements: releasing
# ---
# Call only after the saved plan's commit and ALL records were pushed atomically.
# Validate the whole set before dispatching any package. Rerun Publish, not
# Release, to recover an individual failed dispatch without applying versions.
set -euo pipefail
plan="${1:?release plan required}"
records="$(node --input-type=module - "$plan" <<'JS'
import * as fs from 'node:fs';
const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(plan.tags)) throw new Error('Saved plan must contain tags.');
const names = new Set();
for (const tag of plan.tags) {
  if (typeof tag?.name !== 'string' || !/^(t3code-(lib|cli|mcp)|t3c-docs|t3mcp-docs)@\d+\.\d+\.\d+$/.test(tag.name)) {
    throw new Error('Saved plan must contain supported unit@X.Y.Z records.');
  }
  if (tag.name.split('@')[0] !== tag.release_unit || names.has(tag.name)) {
    throw new Error('Saved plan has a release unit/tag mismatch or duplicate record.');
  }
  names.add(tag.name);
}
if (plan.tags.length > 3) {
  for (const name of names) console.log(name);
}
JS
)"
# shellcheck source=scripts/release/unit.sh
source "$(dirname "$0")/unit.sh"
docs_record=''
docs_carried=false
while IFS= read -r record; do
  [[ -n "$record" && "${record#*@}" != 0.0.0 ]] || continue
  if is_docs_unit "${record%@*}"; then
    docs_record="${docs_record:-$record}"
    continue
  fi
  release_unit "${record%@*}"
  [[ "$unit" == t3code-lib ]] || docs_carried=true
  gh workflow run publish.yml --ref "$record" -f "ref=$record" -f publish-package=true
done <<< "$records"
# A CLI or MCP run publishes the docs. Without one, a docs-only run must.
if [[ -n "$docs_record" && "$docs_carried" == false ]]; then
  gh workflow run publish.yml --ref "$docs_record" -f "ref=$docs_record"
fi
