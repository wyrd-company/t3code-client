#!/usr/bin/env bash
# shellcheck disable=SC2034
# Shared release-unit identity. Source from a script before any side effect.
release_unit() {
  case "${1:-}" in
    t3code-lib|t3code-cli) unit="$1" ;;
    *) echo "Unknown release unit: ${1:-missing}." >&2; return 1 ;;
  esac
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  package_dir="$root/packages/$unit"
  package="@wyrd-company/$unit"
}
# The docs unit is tag-only: it has a release record and no package.
is_docs_unit() {
  [[ "${1:-}" == t3c-docs ]]
}
