#!/usr/bin/env bash
# Validate the working release configuration without adding tags to this repo.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
scratch="$(mktemp -d)"
cleanup() { node -e 'require("node:fs").rmSync(process.argv[1], {recursive:true, force:true})' "$scratch"; }
trap cleanup EXIT
git clone --quiet --shared "$root" "$scratch"
# Release units come from .intentional/config.yml. Package units project their
# version into package.json; docs.yml holds product versions as yaml projections.
# A projection file that starts with / is relative to the repository root.
config="$root/.intentional/config.yml"
mapfile -t units < <(yq '.release-units | keys | .[]' "$config")
# shellcheck disable=SC2016 # yq variables, not shell expansions
projections="$(yq '.release-units | to_entries | .[] | .key as $unit | .value.path as $path | .value.projections[]? | [$unit, .adapter, $path, .file, .pointer // ""] | @tsv' "$config" |
  awk -F'\t' -v OFS='\t' '{ file = ($4 ~ /^\//) ? substr($4, 2) : $3 "/" $4; print $1, $2, file, $5 }')"
# Include pending edits so this is also useful before committing a refactor.
while IFS=$'\t' read -r unit _ file _; do
  [[ -n "$unit" ]] || continue
  [[ -f "$root/$file" ]] || continue
  mkdir -p "$scratch/$(dirname "$file")"
  cp "$root/$file" "$scratch/$file"
done <<<"$projections"
rm -rf "$scratch/.intentional"
cp -R "$root/.intentional" "$scratch/.intentional"
cd "$scratch"
# Only the initial zero-version package units may use ephemeral authority. A
# docs unit starts at the version its yaml projection holds. Existing records are always read from the cloned history.
baseline=(intentional tag --baseline)
needs_baseline=false
for unit in "${units[@]}"; do
  [[ -z "$(git tag --list "$unit@*")" ]] || continue
  needs_baseline=true
  package="$(awk -F'\t' -v unit="$unit" '$1 == unit && $2 == "npm" { print $3; exit }' <<<"$projections")"
  if [[ -n "$package" ]]; then
    version="$(node -p "require('./$package').version")"
    if [[ "$version" != "0.0.0" ]]; then
      echo "Missing authoritative baseline for $unit@$version." >&2
      exit 1
    fi
    continue
  fi
  IFS=$'\t' read -r file pointer < <(awk -F'\t' -v unit="$unit" '$1 == unit && $2 == "yaml" { print $3 "\t" $4; exit }' <<<"$projections") || true
  version=""
  if [[ -n "${file:-}" && -n "${pointer:-}" ]]; then
    expression=""
    IFS=/ read -ra keys <<<"${pointer#/}"
    for key in "${keys[@]}"; do expression+="[\"$key\"]"; done
    version="$(yq ".$expression // \"\"" "$file" 2>/dev/null || true)"
  fi
  if [[ -z "$version" ]]; then
    echo "Missing authoritative baseline for $unit: ${file:-no yaml projection} has no version at ${pointer:-its pointer}." >&2
    exit 1
  fi
  baseline+=(--version "$unit=$version")
done
# Initial units arrive together. Existing history must never be re-baselined.
if "$needs_baseline"; then
  "${baseline[@]}"
fi
intentional check
intentional status
