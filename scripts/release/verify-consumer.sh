#!/usr/bin/env bash
# Install a packed tarball into a scratch consumer and check that it imports at
# runtime and typechecks under NodeNext and Bundler resolution with the oldest
# TypeScript line the package supports.
set -euo pipefail

tarball="$(realpath "${1:?tarball is required}")"
unit="${2:-t3code-lib}"
case "$unit" in
  t3code-lib|t3code-cli|t3code-mcp) ;;
  *) echo "Unknown release unit $unit." >&2; exit 1 ;;
esac
typescript="${CONSUMER_TYPESCRIPT:-typescript@5.9}"
consumer="$(mktemp -d)"
trap 'rm -rf "$consumer"' EXIT

cd "$consumer"
printf '{ "name": "consumer", "private": true, "type": "module" }\n' > package.json
if [[ "$unit" == t3code-mcp ]]; then
  library="$(realpath "${3:?MCP verification requires the library tarball}")"
  npm install --silent --no-audit --no-fund "$library" "$tarball" "$typescript" "@types/node@24"
  ./node_modules/.bin/t3code-mcp --version
  # shellcheck disable=SC2016 # JavaScript template literals stay literal.
  node --input-type=module -e '
    const mcp = await import("@wyrd-company/t3code-mcp");
    for (const name of ["createServer", "loadConfig", "ServerRegistry"])
      if (typeof mcp[name] !== "function") throw new Error(`Missing public export ${name}.`);
  '
  cat > index.ts <<'TS'
import { createServer, ServerRegistry, type McpConfig } from "@wyrd-company/t3code-mcp";
export const config: McpConfig = { servers: {}, allowTools: ["*"], denyTools: [], readOnly: false, serverPolicies: {} };
export const server = createServer(new ServerRegistry(config));
TS
  for resolution in "NodeNext NodeNext" "ESNext Bundler"; do
    read -r module moduleResolution <<<"$resolution"
    npx tsc --noEmit --strict --skipLibCheck false --types node --target ES2022 \
      --module "$module" --moduleResolution "$moduleResolution" index.ts
  done
  echo "MCP consumer check passed for $(basename "$tarball")."
  exit 0
fi
if [[ "$unit" == t3code-cli ]]; then
  # The library tarball avoids relying on first-publication ordering.
  library="$(realpath "${3:?CLI verification requires the library tarball}")"
  npm install --silent --no-audit --no-fund "$library" "$tarball"
  ./node_modules/.bin/t3c --version
  echo "CLI consumer check passed for $(basename "$tarball")."
  exit 0
fi
npm install --silent --no-audit --no-fund "$tarball" "$typescript" "@types/node@24"

cat > index.ts <<'TS'
import {
  T3Client,
  T3RpcError,
  isTurnItemOfType,
  memoryCredentialStore,
  type OrchestrationV2TurnItem,
  type T3ClientOptions,
} from "@wyrd-company/t3code-lib";

const options: T3ClientOptions = {
  baseUrl: "http://127.0.0.1:1",
  credentials: memoryCredentialStore(),
};
export const client = T3Client.create(options);

// Turn items and RPC errors narrow to typed records.
export function exitCode(item: OrchestrationV2TurnItem): number | undefined {
  return isTurnItemOfType(item, "command_execution") ? item.exitCode : undefined;
}
export function dispatchMessage(error: T3RpcError): string | undefined {
  return error.is("OrchestrationV2DispatchCommandError") ? error.record.message : undefined;
}
TS

for resolution in "NodeNext NodeNext" "ESNext Bundler"; do
  read -r module moduleResolution <<<"$resolution"
  npx tsc --noEmit --strict --skipLibCheck false --types node --target ES2022 \
    --module "$module" --moduleResolution "$moduleResolution" index.ts
done

node --input-type=module -e '
  const library = await import("@wyrd-company/t3code-lib");
  if (typeof library.T3Client?.create !== "function") throw new Error("T3Client.create is missing.");
'
echo "Consumer check passed for $(basename "$tarball")."
