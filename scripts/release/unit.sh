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
