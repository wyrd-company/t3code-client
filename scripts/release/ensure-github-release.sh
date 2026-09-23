#!/usr/bin/env bash
# Create the GitHub Release for a release tag with the packed tarball and the
# changelog section as notes, or verify the one that already exists.
set -euo pipefail

tag="${1:?tag is required}"
directory="${2:?package directory is required}"
version="${tag#t3code-client@}"

tarball="$directory/wyrd-company-t3code-client-$version.tgz"
notes="$directory/release-notes.md"
for file in "$tarball" "$notes"; do
  if [[ ! -f "$file" ]]; then
    echo "Expected release input $file does not exist." >&2
    exit 1
  fi
done

if ! gh release view "$tag" > /dev/null 2>&1; then
  gh release create "$tag" "$tarball" \
    --title "$tag" \
    --notes-file "$notes" \
    --verify-tag
fi

asset="$(basename "$tarball")"
count="$(gh release view "$tag" --json assets --jq "[.assets[] | select(.name == \"$asset\")] | length")"
if [[ "$count" != "1" ]]; then
  echo "GitHub Release $tag does not carry $asset." >&2
  exit 1
fi
