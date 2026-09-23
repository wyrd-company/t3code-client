#!/usr/bin/env bash
# Copy one version's section of the changelog to a file. Fails when the
# changelog has no section for the version.
set -euo pipefail

version="${1:?version is required}"
changelog="${2:?changelog path is required}"
output="${3:?output path is required}"

if [[ ! -f "$changelog" ]]; then
  echo "Changelog $changelog does not exist." >&2
  exit 1
fi

awk -v heading="## $version" '
  $0 == heading { found = 1 }
  found && /^## / && $0 != heading { exit }
  found { print }
  END { if (!found) exit 2 }
' "$changelog" > "$output" || {
  echo "Changelog has no ## $version section." >&2
  exit 1
}
