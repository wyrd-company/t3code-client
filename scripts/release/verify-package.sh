#!/usr/bin/env bash
# Pack exactly one unit; stdout is the absolute tarball path.
set -euo pipefail
# shellcheck source=scripts/release/unit.sh
source "$(dirname "$0")/unit.sh"
release_unit "${1:?release unit is required}"
destination="${2:-$(mktemp -d)}"
mkdir -p "$destination"
destination="$(cd "$destination" && pwd)"
node --input-type=module - "$package_dir/package.json" "$package" <<'JS'
import * as fs from 'node:fs';
const [file, expected] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
if (manifest.name !== expected || manifest.private) {
  throw new Error(`Refusing to pack ${manifest.name}: expected public ${expected}.`);
}
JS
version="$(node -p "require('$package_dir/package.json').version")"
tarball="$destination/wyrd-company-$unit-$version.tgz"
pnpm --dir "$package_dir" pack --pack-destination "$destination" >&2
files="$(tar -tzf "$tarball")"
required=(package/package.json package/LICENSE package/README.md)
case "$unit" in
  t3code-lib) required+=(package/dist/index.js package/dist/index.d.ts) ;;
  t3code-cli) required+=(package/dist/cli.js package/npm-shrinkwrap.json package/commandSurface.json) ;;
  t3code-mcp) required+=(package/dist/cli.js package/dist/index.js package/dist/index.d.ts) ;;
esac
for file in "${required[@]}"; do
  if ! grep -qx "$file" <<<"$files"; then
    echo "Package is missing $file." >&2
    exit 1
  fi
done
if grep -E '^package/(src|test)/|\.test\.(js|d\.ts)$' <<<"$files" >&2; then
  echo "Package ships source or test files." >&2
  exit 1
fi
if [[ "$unit" == t3code-mcp ]]; then
  # The MCP server is not the t3c command line.
  if grep -E '^package/(commandSurface\.json|npm-shrinkwrap\.json)$' <<<"$files" >&2; then
    echo "MCP package ships CLI command assets." >&2
    exit 1
  fi
  tar -xOf "$tarball" package/package.json | node --input-type=module -e '
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const manifest = JSON.parse(input);
    if (manifest.bin?.["t3code-mcp"] !== "dist/cli.js") throw new Error("MCP executable must be dist/cli.js.");
  '
  if [[ "$(tar -xOf "$tarball" package/dist/cli.js | sed -n 1p)" != "#!/usr/bin/env node" ]]; then
    echo "MCP executable has no node shebang." >&2
    exit 1
  fi
fi
if [[ "$unit" == t3code-cli ]]; then
  tar -xOf "$tarball" package/commandSurface.json | node --input-type=module -e '
    import assert from "node:assert/strict";
    import * as fs from "node:fs";
    const packed = JSON.parse(fs.readFileSync(0, "utf8"));
    const canonical = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    assert.deepEqual(packed, canonical, "Packed CLI command surface differs from canonical source.");
  ' "$root/docs/specifications/cli-surface.json"
  tar -xOf "$tarball" package/npm-shrinkwrap.json | node --input-type=module -e '
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const lock = JSON.parse(input);
    if (lock.name !== process.argv[1] || lock.version !== process.argv[2]) throw new Error("Shrinkwrap identity mismatch.");
    for (const entry of Object.values(lock.packages ?? {})) {
      if (entry.link || /^(workspace:|file:|link:)/.test(entry.resolved ?? "")) throw new Error("Shrinkwrap contains workspace paths.");
    }
  ' "$package" "$version"
fi
printf '%s\n' "$tarball"
