#!/usr/bin/env bash
# Build the package tarball and check it ships the compiled library and
# nothing from the source or test trees. Prints the tarball path.
set -euo pipefail

destination="${1:-$(mktemp -d)}"
mkdir -p "$destination"

pnpm pack --pack-destination "$destination" >&2
tarball="$(find "$destination" -maxdepth 1 -name 'wyrd-company-t3code-client-*.tgz' -print -quit)"
if [[ -z "$tarball" ]]; then
  echo "pnpm pack produced no tarball in $destination." >&2
  exit 1
fi

files="$(tar -tzf "$tarball")"
for required in package/package.json package/dist/index.js package/dist/index.d.ts package/LICENSE package/README.md; do
  if ! grep -qx "$required" <<<"$files"; then
    echo "Package is missing $required." >&2
    exit 1
  fi
done
if grep -E '^package/(src|test)/|\.test\.(js|d\.ts)$' <<<"$files" >&2; then
  echo "Package ships source or test files." >&2
  exit 1
fi

echo "$tarball"
