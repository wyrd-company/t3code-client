#!/usr/bin/env bash
# Install a packed tarball into a scratch consumer and check that it imports at
# runtime and typechecks under NodeNext and Bundler resolution with the oldest
# TypeScript line the package supports. Executable units install with the
# matching library tarball, so they do not depend on first-publication ordering.
set -euo pipefail

tarball="$(realpath "${1:?tarball is required}")"
unit="${2:-t3code-lib}"
case "$unit" in
  t3code-lib|t3code-cli|t3code-mcp|t3code-proxy) ;;
  *) echo "Unknown release unit $unit." >&2; exit 1 ;;
esac
typescript="${CONSUMER_TYPESCRIPT:-typescript@5.9}"
consumer="$(mktemp -d)"
trap 'rm -rf "$consumer"' EXIT

cd "$consumer"
printf '{ "name": "consumer", "private": true, "type": "module" }\n' > package.json
if [[ "$unit" == t3code-proxy ]]; then
  # The proxy has no runtime library dependency, so no library tarball is needed.
  npm install --silent --no-audit --no-fund "$tarball"
  version="$(node -p 'require("@wyrd-company/t3code-proxy/package.json").version')"
  reported="$(./node_modules/.bin/t3c-proxy --version)"
  if [[ "$reported" != "$version" ]]; then
    echo "t3c-proxy --version reported '$reported', expected $version." >&2
    exit 1
  fi
  printf 'upstream: http://127.0.0.1:1\nusers:\n  - name: Sample\n    port: 4101\n' > config.yml
  listed="$(./node_modules/.bin/t3c-proxy --config config.yml --list-users)"
  if [[ "$listed" != "$(printf '4101\tSample')" ]]; then
    echo "t3c-proxy --list-users reported '$listed'." >&2
    exit 1
  fi
  # The installed executable serves a request, then stops on SIGTERM with exit 0.
  node --input-type=module - "$consumer/node_modules/.bin/t3c-proxy" <<'JS'
import * as NodeChildProcess from 'node:child_process';
import * as NodeHttp from 'node:http';
import * as NodeNet from 'node:net';
const fail = (message) => { console.error(message); process.exit(1); };
const timer = setTimeout(() => fail('t3c-proxy did not answer.'), 30_000);
const upstream = NodeHttp.createServer((_request, response) => response.end('sample'));
await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const probe = NodeNet.createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const { port } = probe.address();
await new Promise((resolve) => probe.close(resolve));
const service = NodeChildProcess.spawn(process.argv[2], [
  '--upstream', `http://127.0.0.1:${upstream.address().port}`, '--user', `Sample=${port}`,
], { stdio: ['ignore', 'ignore', 'pipe'] });
service.stderr.setEncoding('utf8');
await new Promise((resolve) => service.stderr.on('data', (line) => { if (line.includes('listening')) resolve(); }));
const answer = await fetch(`http://127.0.0.1:${port}/`);
if ((await answer.text()) !== 'sample') fail('t3c-proxy did not forward the request.');
const exited = new Promise((resolve) => service.once('exit', (code, signal) => resolve({ code, signal })));
service.kill('SIGTERM');
const { code, signal } = await exited;
if (code !== 0) fail(`t3c-proxy stopped with code ${code} and signal ${signal}.`);
upstream.close();
upstream.closeAllConnections();
clearTimeout(timer);
JS
  echo "Proxy consumer check passed for $(basename "$tarball")."
  exit 0
fi
if [[ "$unit" != t3code-lib ]]; then
  library="$(realpath "${3:?$unit verification requires the library tarball}")"
fi
if [[ "$unit" == t3code-cli ]]; then
  npm install --silent --no-audit --no-fund "$library" "$tarball"
  ./node_modules/.bin/t3c --version
  echo "CLI consumer check passed for $(basename "$tarball")."
  exit 0
fi
if [[ "$unit" == t3code-mcp ]]; then
  npm install --silent --no-audit --no-fund "$library" "$tarball" "$typescript" "@types/node@24"
  # Profiles resolve lazily; a task-owned config root excludes caller profiles.
  export T3C_CONFIG_HOME="$consumer/profiles"
  mkdir -p "$T3C_CONFIG_HOME"
  version="$(node -p 'require("@wyrd-company/t3code-mcp/package.json").version')"
  reported="$(./node_modules/.bin/t3code-mcp --version)"
  if [[ "$reported" != *"$version"* ]]; then
    echo "t3code-mcp --version reported '$reported', expected $version." >&2
    exit 1
  fi
  # The installed executable answers initialize and tools/list over stdio
  # with exactly the complementary inventory, without an upstream connection.
  node --input-type=module - "$consumer/node_modules/.bin/t3code-mcp" <<'JS'
import * as NodeChildProcess from 'node:child_process';
import * as NodeReadline from 'node:readline';
const expected = [
  'configure_scheduled_task', 'provider_status', 'rotate_scheduled_task_webhook',
  'scheduled_task_configuration', 'scheduled_task_deliveries', 'scheduled_task_delivery',
  'scheduled_task_endpoint', 'thread_approvals', 'thread_diff',
  'thread_queue_resume', 'thread_queue_start', 'thread_search_content',
  'thread_status', 'thread_stop', 'thread_usage', 'usage_summary',
];
const server = NodeChildProcess.spawn(process.argv[2], [], { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = NodeReadline.createInterface({ input: server.stdout })[Symbol.asyncIterator]();
const timer = setTimeout(() => { server.kill(); throw new Error('MCP server did not answer.'); }, 30_000);
const send = (message) => server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
async function response(id) {
  for (;;) {
    const { value, done } = await lines.next();
    if (done) throw new Error('MCP server closed stdout.');
    const message = JSON.parse(value);
    if (message.id !== id) continue;
    if (message.error) throw new Error(`MCP request ${id} failed: ${message.error.message}`);
    return message.result;
  }
}
send({ id: 1, method: 'initialize', params: {
  protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'consumer', version: '0.0.0' },
} });
const initialized = await response(1);
if (initialized.serverInfo?.name !== 't3code-mcp') throw new Error('Unexpected MCP server identity.');
send({ method: 'notifications/initialized' });
send({ id: 2, method: 'tools/list', params: {} });
const names = (await response(2)).tools.map((tool) => tool.name).sort();
if (JSON.stringify(names) !== JSON.stringify(expected)) {
  throw new Error(`MCP tools differ: ${names.join(' ')}`);
}
server.stdin.end();
const status = await new Promise((resolve) => server.once('exit', (code, signal) => resolve(code ?? signal)));
clearTimeout(timer);
if (status !== 0) throw new Error(`MCP server exited with ${status} after stdin closed.`);
JS
  cat > index.ts <<'TS'
import {
  SharedClient,
  createServer,
  serverVersion,
  type ClientProvider,
  type ConnectionOptions,
} from "@wyrd-company/t3code-mcp";

const options: ConnectionOptions = { profile: "sample" };
export const clients: ClientProvider = new SharedClient(options);
export const server = createServer(clients, []);
export const version: string = serverVersion;
TS
  for resolution in "NodeNext NodeNext" "ESNext Bundler"; do
    read -r module moduleResolution <<<"$resolution"
    npx tsc --noEmit --strict --skipLibCheck false --types node --target ES2022 \
      --module "$module" --moduleResolution "$moduleResolution" index.ts
  done
  node --input-type=module -e '
    const mcp = await import("@wyrd-company/t3code-mcp");
    if (typeof mcp.createServer !== "function") throw new Error("createServer is missing.");
  '
  echo "MCP consumer check passed for $(basename "$tarball")."
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
