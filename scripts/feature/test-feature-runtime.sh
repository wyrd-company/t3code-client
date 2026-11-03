#!/usr/bin/env bash
# ---
# relationships:
#   verifies: proxy
# ---
# The runtime scenario. A dev container with the t3code-server, Caddy and proxy Features reads a
# bind-mounted config file. Caddy gets certificates from a test ACME CA for the derived hostnames.
# A message through a person's hostname stores the byline. Everything runs in test containers on
# their own network.
set -euo pipefail
# shellcheck source=scripts/feature/common.sh
source "$(dirname "$0")/common.sh"

prepare_test_base

suffix="${RANDOM}-$$"
network="t3code-proxy-feature-${suffix}"
ca="t3code-proxy-feature-ca-${suffix}"
project="${workspace}/project"
mkdir -p "${project}/.devcontainer"
docker network create "${network}" >/dev/null
cleanup_steps+=("docker network rm ${network}")
cleanup_steps=("docker rm --force ${ca}" "${cleanup_steps[@]}")

cat >"${workspace}/Caddyfile" <<'CADDY'
acme.example.test {
  tls internal
  acme_server
}
CADDY
docker run --detach --name "${ca}" --network "${network}" --network-alias acme.example.test \
  --mount "type=bind,source=${workspace}/Caddyfile,target=/etc/caddy/Caddyfile,readonly" \
  caddy:2-alpine >/dev/null
root_ready() {
  docker cp "${ca}:/data/caddy/pki/authorities/local/root.crt" "${project}/.devcontainer/acme-root.crt" 2>/dev/null
}
wait_until 60 root_ready || fail "The test CA has no root certificate."
chmod 0644 "${project}/.devcontainer/acme-root.crt"

server_version="$(node -p "require('${repo_root}/packages/t3code-lib/package.json').devDependencies.t3")"
cp -R "${feature_root}/src/t3code-proxy" "${project}/.devcontainer/t3code-proxy"
config="${project}/.devcontainer/t3code-proxy.yml"
write_config() {
  {
    printf 'upstream: http://127.0.0.1:3773\nusers:\n'
    for entry in "$@"; do
      printf '  - name: %s\n    port: %s\n' "${entry%=*}" "${entry#*=}"
    done
  } >"${config}"
}
write_config Alice=4101 Sam=4102
chmod 0644 "${config}"

# A high host port, because the host may use 443.
published_port="$((20000 + RANDOM % 20000))"

# The config follows the Feature README, with a test network and the test CA added.
cat >"${project}/.devcontainer/devcontainer.json" <<JSON
{
  "image": "${test_base}",
  "features": {
    "ghcr.io/wyrd-company/devcontainers/caddy:1": {
      "acmeCa": "https://acme.example.test/acme/local/directory",
      "acmeCaRoot": "/etc/sample-acme-root.crt"
    },
    "ghcr.io/wyrd-company/devcontainers/t3code-server:2": {
      "version": "${server_version}",
      "dnsName": "t3.dev.example.test"
    },
    "./t3code-proxy": {}
  },
  "overrideCommand": false,
  "appPort": ["${published_port}:443"],
  "runArgs": [
    "--network=${network}",
    "--network-alias=t3.dev.example.test",
    "--network-alias=t3-alice.dev.example.test",
    "--network-alias=t3-sam.dev.example.test"
  ],
  "mounts": [
    "source=\${localWorkspaceFolder}/.devcontainer/t3code-proxy.yml,target=/etc/t3code-proxy/config.yml,type=bind,readonly",
    "source=\${localWorkspaceFolder}/.devcontainer/acme-root.crt,target=/etc/sample-acme-root.crt,type=bind,readonly"
  ]
}
JSON

up="$(devcontainer up --workspace-folder "${project}" --log-format json 2>/dev/null | tail -n 1)"
container="$(jq -r '.containerId // empty' <<<"${up}")"
[ -n "${container}" ] || fail "The dev container did not start: ${up}"
cleanup_steps=("docker rm --force ${container}" "${cleanup_steps[@]}")

report() {
  docker logs --tail 80 "${container}" >&2 || true
}
in_container() {
  docker exec "${container}" "$@"
}

proxy_pid() {
  in_container /command/s6-svstat -p /run/service/t3code-proxy | grep -Ev '^-?[01]$'
}
wait_until 240 proxy_pid >/dev/null || { report; fail "The proxy service is not running."; }
sites_ready() {
  in_container test -f /etc/caddy/conf.d/t3code-proxy.caddy
}
wait_until 60 sites_ready || { report; fail "The service wrote no Caddy file."; }

pid="$(proxy_pid)"
[ "$(in_container stat -c %U "/proc/${pid}")" = vscode ] || fail "The service does not run as vscode."
command_line="$(in_container cat "/proc/${pid}/cmdline" | tr '\0' ' ')"
grep -q -- '--config /etc/t3code-proxy/config.yml' <<<"${command_line}" \
  || fail "The service does not pass the config path."
environment="$(docker exec --user vscode "${container}" cat "/proc/${pid}/environ" | tr '\0' '\n')"
grep -qx 'HOME=/home/vscode' <<<"${environment}" \
  || fail "The service does not have the user's environment."

token="$(in_container runuser --user vscode -- /usr/local/bin/t3 auth session issue \
  --base-dir /home/vscode/.t3 --label feature-runtime --token-only)"
in_container runuser --user vscode -- mkdir -p /tmp/sample-project
address="$(docker inspect --format "{{(index .NetworkSettings.Networks \"${network}\").IPAddress}}" "${container}")"

(
  cd "${repo_root}"
  pnpm --filter @wyrd-company/t3code-lib run build >&2
  T3_FEATURE_ADDRESS="${address}" T3_FEATURE_TOKEN="${token}" \
    NODE_EXTRA_CA_CERTS="${project}/.devcontainer/acme-root.crt" \
    pnpm --filter @wyrd-company/t3code-proxy exec vp test run --config vitest.feature.config.ts
)

# The README's `appPort` reaches a person's hostname from the Docker host.
published_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 20 \
  --cacert "${project}/.devcontainer/acme-root.crt" \
  --resolve "t3-alice.dev.example.test:${published_port}:127.0.0.1" \
  "https://t3-alice.dev.example.test:${published_port}/")" || true
[ "${published_status}" = 200 ] || fail "The published port answered ${published_status}."

# A restart reads the file again, and a removed person loses their site.
write_config Alice=4101
in_container /command/s6-svc -r /run/service/t3code-proxy
sam_removed() {
  ! in_container grep -q t3-sam /etc/caddy/conf.d/t3code-proxy.caddy
}
wait_until 60 sam_removed || { report; fail "A restart did not remove the site of a removed person."; }
if in_container grep -q t3-sam /etc/caddy/required-hosts.d/t3code-proxy.host; then
  fail "A removed person stays in the required hosts."
fi

# An invalid file fails loudly and leaves no listener.
printf 'users: []\nunknown: value\n' >"${config}"
in_container /command/s6-svc -r /run/service/t3code-proxy
service_down() {
  ! in_container curl --silent --output /dev/null --max-time 1 http://127.0.0.1:4101/
}
wait_until 60 service_down || { report; fail "An invalid config file left the service running."; }
# A variable and not a pipe: with pipefail, `grep -q` that stops early can fail the pipe.
log_names_key() {
  local logs
  logs="$(docker logs "${container}" 2>&1)"
  grep -qF 'Unrecognized key: "unknown"' <<<"${logs}"
}
wait_until 60 log_names_key || { report; fail "The log does not name the invalid key."; }

printf 'The runtime scenario passed.\n'
