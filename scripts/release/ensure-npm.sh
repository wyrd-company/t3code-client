#!/usr/bin/env bash
# Publish the packed tarball to npmjs, or verify that the version already
# published there has the same contents.
set -euo pipefail

# shellcheck source=scripts/release/unit.sh
source "$(dirname "$0")/unit.sh"
release_unit "${1:?release unit is required}"
version="${2:?version is required}"
directory="${3:?package directory is required}"

tarball="$directory/wyrd-company-$unit-$version.tgz"
if [[ ! -f "$tarball" ]]; then
  echo "Expected package $tarball does not exist." >&2
  exit 1
fi
node --input-type=module - "$tarball" "$package" "$version" <<'JS'
import { execFileSync } from 'node:child_process';
const [file, expected, version] = process.argv.slice(2);
const manifest = JSON.parse(execFileSync('tar', ['-xOf', file, 'package/package.json'], {encoding:'utf8'}));
if (manifest.name !== expected || manifest.version !== version || manifest.private) throw new Error('Tarball identity mismatch or private package.');
JS
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
