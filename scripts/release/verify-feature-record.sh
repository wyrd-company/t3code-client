#!/usr/bin/env bash
# ---
# relationships:
#   implements: releasing
# ---
# Verify that a tag is the Intentional release record for the checked-out Feature: annotated,
# written by Intentional for this unit, pointing at HEAD on main, and naming the version that
# devcontainer-feature.json declares.
set -euo pipefail

tag="${1:?tag is required}"
manifest="${2:-features/src/t3code-proxy/devcontainer-feature.json}"

if [[ ! "$tag" =~ ^t3code-proxy-feature@[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Tag $tag is not a Feature record." >&2
  exit 1
fi
version="${tag#*@}"

# A tag checkout can leave the annotated tag object and main behind.
git fetch --quiet --no-tags origin "+refs/tags/$tag:refs/tags/$tag" "+refs/heads/main:refs/remotes/origin/main"

if [[ "$(git cat-file -t "refs/tags/$tag")" != "tag" ]]; then
  echo "Tag $tag is not annotated, so it is not an Intentional release record." >&2
  exit 1
fi
record="$(git cat-file -p "refs/tags/$tag")"
for field in "tag-id: release-unit/t3code-proxy-feature/primary" "version: $version"; do
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
if ! git merge-base --is-ancestor "refs/tags/$tag^{commit}" refs/remotes/origin/main; then
  echo "Tag $tag points at a commit that is not on main." >&2
  exit 1
fi
declared="$(jq -r .version "$manifest")"
if [[ "$declared" != "$version" ]]; then
  echo "devcontainer-feature.json declares $declared, but the tag records $version." >&2
  exit 1
fi
