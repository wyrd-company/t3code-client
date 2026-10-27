#!/usr/bin/env bash
# ---
# relationships:
#   implements: releasing
# ---
# Run from the workflow source checkout before checking out an older record.
# The build still verifies HEAD, main ancestry and the target manifest.
set -euo pipefail
event="${1:?event required}"
ref="${2:?ref required}"
publish_package="${3:-false}"
# shellcheck source=scripts/release/unit.sh
source "$(dirname "$0")/unit.sh"

case "$publish_package" in
  true|false) ;;
  *) echo 'publish-package must be true or false.' >&2; exit 1 ;;
esac

record=''
build_package=false
if [[ "$event" == push || ( "$event" == workflow_dispatch && "$publish_package" == true ) ]]; then
  if release_unit "${ref%@*}" 2>/dev/null; then
    if [[ ! "$ref" =~ ^[^@]+@[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "Record $ref must name a supported unit@X.Y.Z." >&2
      exit 1
    fi
    if [[ "${ref#*@}" == 0.0.0 && "$event" == push ]]; then
      : # Zero baselines never start publication.
    else
      if [[ "${ref#*@}" == 0.0.0 ]]; then
        echo "Record $ref is a baseline, not a package release." >&2
        exit 1
      fi
      if [[ "$(git cat-file -t "refs/tags/$ref")" != tag ]]; then
        echo "Record $ref must be an existing annotated release tag." >&2
        exit 1
      fi
      annotation="$(git cat-file -p "refs/tags/$ref")"
      for field in "tag-id: release-unit/$unit/primary" "version: ${ref#*@}"; do
        if ! grep -qx "$field" <<< "$annotation"; then
          echo "Record $ref does not record '$field'." >&2
          exit 1
        fi
      done
      if grep -qx 'baseline: true' <<< "$annotation"; then
        echo "Record $ref is a baseline, not a package release." >&2
        exit 1
      fi
      record="$ref"
      build_package=true
    fi
  elif [[ "$event" == workflow_dispatch ]]; then
    echo 'publish-package requires a supported nonzero npm release record.' >&2
    exit 1
  fi
fi
printf 'record=%s\nbuild-package=%s\n' "$record" "$build_package"
