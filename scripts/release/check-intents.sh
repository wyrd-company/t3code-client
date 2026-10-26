#!/usr/bin/env bash
# Validate the working release configuration without adding tags to this repo.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
scratch="$(mktemp -d)"
cleanup() { node -e 'require("node:fs").rmSync(process.argv[1], {recursive:true, force:true})' "$scratch"; }
trap cleanup EXIT
git clone --quiet --shared "$root" "$scratch"
# Release units come from .intentional/config.yml: package units carry a
# projection file, and tag-only units (the docs unit) carry none.
config="$root/.intentional/config.yml"
mapfile -t units < <(yq '.release-units | keys | .[]' "$config")
# shellcheck disable=SC2016 # yq variables, not shell expansions
projections="$(yq '.release-units | to_entries | .[] | .key as $unit | .value.path as $path | .value.projections[]? | [$unit, $path + "/" + .file] | @tsv' "$config")"
# Include pending edits so this is also useful before committing a refactor.
while IFS=$'\t' read -r unit file; do
  [[ -n "$unit" ]] || continue
  mkdir -p "$scratch/$(dirname "$file")"
  cp "$root/$file" "$scratch/$file"
done <<<"$projections"
rm -rf "$scratch/.intentional"
cp -R "$root/.intentional" "$scratch/.intentional"
cd "$scratch"
# Only the initial zero-version package units may use ephemeral authority. A
# tag-only unit starts at the docs-version its docs.yml holds. Existing records are always read from the cloned history.
baseline=(intentional tag --baseline)
needs_baseline=false
for unit in "${units[@]}"; do
  [[ -z "$(git tag --list "$unit@*")" ]] || continue
  needs_baseline=true
  file="$(awk -F'\t' -v unit="$unit" '$1 == unit { print $2 }' <<<"$projections")"
  if [[ -n "$file" ]]; then
    version="$(node -p "require('./$file').version")"
    if [[ "$version" != "0.0.0" ]]; then
      echo "Missing authoritative baseline for $unit@$version." >&2
      exit 1
    fi
  else
    key="${unit%-docs}"
    version="$(DOCS_KEY="$key" yq '.products[strenv(DOCS_KEY)].docs-version // ""' "$root/docs/user/docs.yml" 2>/dev/null || true)"
    if [[ -z "$version" ]]; then
      echo "Missing authoritative baseline for $unit: docs/user/docs.yml has no docs-version for $key." >&2
      exit 1
    fi
    baseline+=(--version "$unit=$version")
  fi
done
# Initial units arrive together. Existing history must never be re-baselined.
if "$needs_baseline"; then
  "${baseline[@]}"
fi
intentional check
intentional status
