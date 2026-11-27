#!/usr/bin/env bash
# ---
# relationships:
#   implements: releasing
# ---
# Compare the immutable package artifact with the registry before updating the tap.
set -euo pipefail
archive="$(realpath "${1:?package artifact required}")"
url="${2:?published npm tarball URL required}"
tap="$(realpath "${3:?tap checkout required}")"
root="$(cd "$(dirname "$0")/.." && pwd)"
[[ -e "$tap/.git" ]] || { echo "Tap checkout not found." >&2; exit 1; }
[[ -f "$archive" ]] || { echo "Package artifact not found: $archive" >&2; exit 1; }
download="$(mktemp /tmp/t3c-published-XXXXXX.tgz)"
trap 'rm -f "$download"' EXIT
if ! curl --fail --silent --show-error --location --retry 8 --retry-all-errors \
  --retry-delay 30 --retry-max-time 420 --max-time 30 "$url" --output "$download"; then
  echo "Registry tarball unavailable after retries: $url" >&2
  exit 1
fi
if ! cmp --silent "$archive" "$download"; then
  echo "Registry tarball differs from the release artifact: $url" >&2
  exit 1
fi

formula=Formula/t3c.rb
state="$(git -C "$tap" status --porcelain -- "$formula")"
if [[ -n "$state" ]]; then
  echo "Tap formula has local changes: $formula" >&2
  exit 1
fi
report() {
  printf '%s\n' "$1"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"
  fi
}

outcome="$(python3 "$root/scripts/release/render-homebrew.py" "$download" "$url" "$tap/$formula" --update-tap)"
git -C "$tap" add -- "$formula"
if git -C "$tap" diff --cached --quiet -- "$formula"; then
  report "$outcome"
  exit 0
fi
version="${url##*/t3code-cli-}"
git -C "$tap" commit -m "chore: update t3c formula to ${version%.tgz}" --only -- "$formula"
if [[ "${PUSH_TAP:-0}" == 1 ]]; then
  git -C "$tap" push origin HEAD:refs/heads/main
  report "Published the Homebrew formula for t3c ${version%.tgz} (tap commit $(git -C "$tap" rev-parse HEAD))."
fi
