#!/usr/bin/env bash
# ---
# relationships:
#   implements: releasing
# ---
# Selects a Feature record to publish. Zero baselines publish nothing.
set -euo pipefail
event="${1:?event required}"
ref="${2:?ref required}"
publish_feature="${3:-false}"
# shellcheck source=scripts/release/unit.sh
source "$(dirname "$0")/unit.sh"

case "$publish_feature" in
  true|false) ;;
  *) echo 'publish-devcontainer-feature must be true or false.' >&2; exit 1 ;;
esac

record=''
if [[ "$event" == push && "$ref" != *@0.0.0 ]] && is_feature_unit "${ref%@*}"; then
  record="$ref"
elif [[ "$event" == workflow_dispatch && "$publish_feature" == true ]]; then
  if ! is_feature_unit "${ref%@*}" || [[ "$ref" == *@0.0.0 ]]; then
    echo 'publish-devcontainer-feature requires a nonzero Feature release record.' >&2
    exit 1
  fi
  record="$ref"
fi
if [[ -n "$record" ]]; then
  if [[ ! "$record" =~ ^[^@]+@[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Record $record must name unit@X.Y.Z." >&2
    exit 1
  fi
  if [[ "$(git cat-file -t "refs/tags/$record")" != tag ]]; then
    echo "Record $record must be an existing annotated release tag." >&2
    exit 1
  fi
fi
printf 'feature-record=%s\n' "$record"
