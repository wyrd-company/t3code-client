#!/usr/bin/env bash
# ---
# relationships:
#   verifies: releasing
# ---
# Local packed-byte proof. Uses installed Node; never upgrades shared dependencies.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
if brew list --formula t3c >/dev/null 2>&1; then
  echo "An existing t3c installation must be preserved; use a clean Homebrew environment." >&2
  exit 1
fi
scratch="$(mktemp -d /tmp/t3c-homebrew-XXXXXX)"
tap="local/t3c-validation-$$"
formula="$tap/t3c"
cleanup() {
  if brew list --formula "$formula" >/dev/null 2>&1; then brew uninstall "$formula"; fi
  brew untap "$tap" || true
  rm -rf "$scratch"
}
trap cleanup EXIT
export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_UPGRADE=1
export HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK=1 HOMEBREW_NO_AUTOREMOVE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
brew list --versions node
library="$(scripts/release/verify-package.sh t3code-lib "$scratch")"
cli="$(scripts/release/verify-package.sh t3code-cli "$scratch")"
brew tap-new --no-git "$tap"
tap_root="$(brew --repository "$tap")"
url="$(node -p 'require("node:url").pathToFileURL(process.argv[1]).href' "$cli")"
python3 scripts/release/render-homebrew.py "$cli" "$url" "$tap_root/Formula/t3c.rb" --local-library "$library"
brew style "$formula"
brew audit --strict "$formula"
brew install --formula --build-from-source "$formula"
"$(brew --prefix "$formula")/bin/t3c" --version
brew test "$formula"
