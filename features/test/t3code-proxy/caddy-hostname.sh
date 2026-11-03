#!/usr/bin/env bash

set -e

# shellcheck disable=SC1091
source dev-container-features-test-lib

sample="$(mktemp)"
chmod 0644 "${sample}"
cat >"${sample}" <<'YAML'
upstream: http://127.0.0.1:3773
users:
  - name: Alice
    port: 4101
  - name: Sam
    port: 4102
YAML

write_as_service_user() {
    runuser --user vscode -- bash -c \
        "t3c-proxy --config '${sample}' --list-users | /usr/local/lib/t3code-proxy/write-caddy-sites"
}

check "the service user is in the caddy-config group" bash -c "id -nG vscode | grep -qw caddy-config"
check "the service depends on the server" test -f /etc/s6-overlay/s6-rc.d/t3code-proxy/dependencies.d/t3code-server
check "the service user writes the Caddy files" write_as_service_user
check "Alice has a site" grep -qx 't3-alice.dev.example.test {' /etc/caddy/conf.d/t3code-proxy.caddy
check "Sam connects to loopback" grep -qx '    reverse_proxy 127.0.0.1:4102' /etc/caddy/conf.d/t3code-proxy.caddy
check "each hostname is required" grep -qx 't3-sam.dev.example.test' /etc/caddy/required-hosts.d/t3code-proxy.host
check "the generated files pass caddy validate" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

reportResults
