#!/usr/bin/env bash
# ---
# relationships:
#   verifies: releasing
# ---
# Refuse placeholders or mismatched identities before Intentional applies versions.
set -euo pipefail
# shellcheck source=scripts/release/unit.sh
source "$(dirname "$0")/unit.sh"
plan="${1:?release plan required}"
mapfile -t units < <(jq -er '.tags[].release_unit' "$plan")
[[ ${#units[@]} -gt 0 ]] || { echo "No release units in plan." >&2; exit 1; }
for selected in "${units[@]}"; do
  # A tag-only docs unit has no package to check.
  if is_docs_unit "$selected"; then continue; fi
  release_unit "$selected"
  node --input-type=module - "$package_dir/package.json" "$package" <<'JS'
import * as fs from 'node:fs';
const [path, expected] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
if (manifest.name !== expected) throw new Error(`Package identity must be ${expected}.`);
if (manifest.private) throw new Error(`Package ${expected} is private.`);
JS
done
