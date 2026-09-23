#!/usr/bin/env bash
# Install a packed tarball into a scratch consumer and check that it imports at
# runtime and typechecks under NodeNext and Bundler resolution with the oldest
# TypeScript line the package supports.
set -euo pipefail

tarball="$(realpath "${1:?tarball is required}")"
typescript="${CONSUMER_TYPESCRIPT:-typescript@5.9}"
consumer="$(mktemp -d)"
trap 'rm -rf "$consumer"' EXIT

cd "$consumer"
printf '{ "name": "consumer", "private": true, "type": "module" }\n' > package.json
npm install --silent --no-audit --no-fund "$tarball" "$typescript" "@types/node@24"

cat > index.ts <<'TS'
import {
  T3Client,
  T3RpcError,
  memoryCredentialStore,
  type OrchestrationThreadActivity,
  type T3ClientOptions,
} from "@wyrd-company/t3code-client";

const options: T3ClientOptions = {
  baseUrl: "http://127.0.0.1:1",
  credentials: memoryCredentialStore(),
};
export const client = T3Client.create(options);

// Activities and RPC errors narrow to typed payloads and records.
export function tokens(activity: OrchestrationThreadActivity): number | undefined {
  if (activity.unknown) return undefined;
  if (activity.kind !== "context-window.updated") return undefined;
  return activity.payload.totalProcessedTokens ?? activity.payload.usedTokens;
}
export function dispatchMessage(error: T3RpcError): string | undefined {
  return error.is("OrchestrationDispatchCommandError") ? error.record.message : undefined;
}
TS

for resolution in "NodeNext NodeNext" "ESNext Bundler"; do
  read -r module moduleResolution <<<"$resolution"
  npx tsc --noEmit --strict --skipLibCheck false --types node --target ES2022 \
    --module "$module" --moduleResolution "$moduleResolution" index.ts
done

node --input-type=module -e '
  const library = await import("@wyrd-company/t3code-client");
  if (typeof library.T3Client?.create !== "function") throw new Error("T3Client.create is missing.");
'
echo "Consumer check passed for $(basename "$tarball")."
