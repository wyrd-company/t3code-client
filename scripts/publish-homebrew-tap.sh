#!/usr/bin/env bash
# ---
# relationships:
#   implements: releasing
# ---
# Finalization only: explicit downloaded npm bytes and explicit tap checkout.
set -euo pipefail
archive="$(realpath "${1:?published npm tarball required}")"
url="${2:?published npm tarball URL required}"
tap="$(realpath "${3:?tap checkout required}")"
root="$(cd "$(dirname "$0")/.." && pwd)"
[[ -e "$tap/.git" ]] || { echo "Tap checkout not found." >&2; exit 1; }
python3 "$root/scripts/release/render-homebrew.py" "$archive" "$url" "$tap/Formula/t3c.rb"
download="$(mktemp /tmp/t3c-published-XXXXXX.tgz)"
trap 'rm -f "$download"' EXIT
curl --fail --silent --show-error --location "$url" --output "$download"
cmp "$archive" "$download"
git -C "$tap" add Formula/t3c.rb
if git -C "$tap" diff --cached --quiet -- Formula/t3c.rb; then
  echo "Formula already up to date."
  exit 0
fi
version="$(tar -xOf "$archive" package/package.json | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).version')"
git -C "$tap" commit -m "chore: update t3c formula to $version"
if [[ "${PUSH_TAP:-0}" == 1 ]]; then git -C "$tap" push origin HEAD; fi
