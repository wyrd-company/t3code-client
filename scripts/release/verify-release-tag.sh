#!/usr/bin/env bash
# Verify that a tag is the Intentional release record for the checked-out
# package: annotated, written by Intentional for this release unit, pointing
# at HEAD, and naming the version package.json declares.
set -euo pipefail

tag="${1:?tag is required}"

if [[ ! "$tag" =~ ^t3code-client@([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
  echo "Tag $tag is not t3code-client@X.Y.Z." >&2
  exit 1
fi
version="${BASH_REMATCH[1]}"

# A shallow tag checkout can leave the annotated tag object behind.
git fetch --quiet --no-tags origin "+refs/tags/$tag:refs/tags/$tag"

if [[ "$(git cat-file -t "refs/tags/$tag")" != "tag" ]]; then
  echo "Tag $tag is not annotated, so it is not an Intentional release record." >&2
  exit 1
fi
record="$(git cat-file -p "refs/tags/$tag")"
for field in "tag-id: release-unit/t3code-client/primary" "version: $version"; do
  if ! grep -qx "$field" <<<"$record"; then
    echo "Tag $tag does not record '$field'." >&2
    exit 1
  fi
done
if grep -qx "baseline: true" <<<"$record"; then
  echo "Tag $tag is a baseline record, not a release." >&2
  exit 1
fi

if [[ "$(git rev-parse "refs/tags/$tag^{commit}")" != "$(git rev-parse HEAD)" ]]; then
  echo "Tag $tag does not point at the checked-out commit." >&2
  exit 1
fi

name="$(node -p 'require("./package.json").name')"
declared="$(node -p 'require("./package.json").version')"
if [[ "$name" != "@wyrd-company/t3code-client" || "$declared" != "$version" ]]; then
  echo "package.json declares $name@$declared, but the tag records $version." >&2
  exit 1
fi
