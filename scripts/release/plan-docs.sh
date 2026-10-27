#!/usr/bin/env bash
# ---
# relationships:
#   implements: releasing
# ---
# Package runs publish only after npm and GitHub Release jobs succeed.
set -euo pipefail
event="${1:?event required}"
ref="${2:?ref required}"
sha="${3:?commit required}"
publish=false
case "$event:$ref" in
  workflow_dispatch:*) publish=true ;;
  push:*@0.0.0) ;; # baseline records establish authority without publication
  push:t3code-cli@*|push:t3code-mcp@*) publish=true ;;
  push:t3c-docs@*|push:t3mcp-docs@*)
    # The publisher reads both products. A package run carries docs released on
    # that same commit so its GitHub Release exists before docs are consumed.
    publish=true
    tags="$(git tag --points-at "$sha" --list 't3code-cli@*' 't3code-mcp@*')"
    while IFS= read -r tag; do
      case "$tag" in
        ''|*@0.0.0) ;;
        *) publish=false ;;
      esac
    done <<< "$tags"
    ;;
esac
printf 'publish=%s\n' "$publish"
