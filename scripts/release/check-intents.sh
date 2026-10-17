#!/usr/bin/env bash
# Validate the working release configuration without adding tags to this repo.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
scratch="$(mktemp -d)"
cleanup() { node -e 'require("node:fs").rmSync(process.argv[1], {recursive:true, force:true})' "$scratch"; }
trap cleanup EXIT
git clone --quiet --shared "$root" "$scratch"
# Include pending edits so this is also useful before committing a refactor.
node --input-type=module - "$root" "$scratch" <<'JS'
import * as fs from 'node:fs';
import * as path from 'node:path';
const [source, target] = process.argv.slice(2);
fs.rmSync(path.join(target, '.intentional'), {recursive: true, force: true});
fs.cpSync(path.join(source, '.intentional'), path.join(target, '.intentional'), {recursive: true});
for (const unit of ['t3code-lib', 't3code-cli']) {
  const relative = `packages/${unit}/package.json`;
  fs.mkdirSync(path.dirname(path.join(target, relative)), {recursive: true});
  fs.copyFileSync(path.join(source, relative), path.join(target, relative));
}
JS
cd "$scratch"
# Only the initial zero-version units may use ephemeral authority. Existing
# records are always read from the cloned history.
needs_baseline=false
for unit in t3code-lib t3code-cli; do
  if [[ -z "$(git tag --list "$unit@*")" ]]; then
    needs_baseline=true
    version="$(node -p "require('./packages/$unit/package.json').version")"
    if [[ "$version" != "0.0.0" ]]; then
      echo "Missing authoritative baseline for $unit@$version." >&2
      exit 1
    fi
  fi
done
# Initial units arrive together. Existing history must never be re-baselined.
if "$needs_baseline"; then
  intentional tag --baseline
fi
intentional check
intentional status
