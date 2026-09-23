#!/usr/bin/env bash
# Publish the packed tarball to npmjs, or verify that the version already
# published there has the same contents.
set -euo pipefail

version="${1:?version is required}"
directory="${2:?package directory is required}"
package="@wyrd-company/t3code-client"

tarball="$directory/wyrd-company-t3code-client-$version.tgz"
if [[ ! -f "$tarball" ]]; then
  echo "Expected package $tarball does not exist." >&2
  exit 1
fi
local_integrity="sha512-$(openssl dgst -sha512 -binary "$tarball" | base64 -w0)"

published_integrity="$(npm view "$package@$version" dist.integrity 2>/dev/null || true)"
if [[ -n "$published_integrity" ]]; then
  if [[ "$published_integrity" != "$local_integrity" ]]; then
    echo "$package@$version is already published with different contents." >&2
    exit 1
  fi
  echo "$package@$version is already published with the same contents."
  exit 0
fi

npm publish "$tarball" --access public --provenance
