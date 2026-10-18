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
for (const unit of ['t3code-lib', 't3code-cli', 't3code-mcp']) {
  const relative = `packages/${unit}/package.json`;
  fs.mkdirSync(path.dirname(path.join(target, relative)), {recursive: true});
  fs.copyFileSync(path.join(source, relative), path.join(target, relative));
}
JS
cd "$scratch"
# Only the initial zero-version units may use ephemeral authority. Existing
# records are always read from the cloned history.
baseline_versions=()
for unit in t3code-lib t3code-cli t3code-mcp; do
  if [[ -z "$(git tag --list "$unit@*")" ]]; then
    version="$(node -p "require('./packages/$unit/package.json').version")"
    if [[ "$version" != "0.0.0" ]]; then
      echo "Missing authoritative baseline for $unit@$version." >&2
      exit 1
    fi
    baseline_versions+=(--version "$unit=0.0.0")
  fi
done
# Initial units arrive together. Existing history must never be re-baselined.
if [[ ${#baseline_versions[@]} -gt 0 ]]; then
  # Baseline operates on the complete inventory, even with --version. Limit
  # only this scratch inventory so released units retain their existing records.
  cp .intentional/config.yml .intentional/config.full.yml
  node --input-type=module - "$root" "${baseline_versions[@]}" <<'JS'
import * as fs from 'node:fs';
import * as module from 'node:module';
const [source, ...args] = process.argv.slice(2);
const {parse, stringify} = module.createRequire(`${source}/package.json`)('yaml');
const wanted = new Set(args.filter(arg => arg !== '--version').map(arg => arg.split('=')[0]));
const config = parse(fs.readFileSync('.intentional/config.yml', 'utf8'));
config.discovery['managed-paths'] = config.discovery['managed-paths'].filter(entry => wanted.has(entry['release-unit']));
config['release-units'] = Object.fromEntries(Object.entries(config['release-units']).filter(([name]) => wanted.has(name)));
fs.writeFileSync('.intentional/config.yml', stringify(config));
JS
  intentional tag --baseline
  mv .intentional/config.full.yml .intentional/config.yml
fi
intentional check
intentional status
