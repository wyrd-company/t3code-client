#!/usr/bin/env bash

set -e

# shellcheck disable=SC1091
source dev-container-features-test-lib

sample="$(mktemp)"
chmod 0644 "${sample}"
printf 'upstream: http://127.0.0.1:3773\nusers:\n  - name: Alice\n    port: 4101\n' >"${sample}"

write_as_service_user() {
    runuser --user vscode -- bash -c \
        "t3c-proxy --config '${sample}' --list-users | /usr/local/lib/t3code-proxy/write-caddy-sites"
}

check "the writer runs" write_as_service_user
check "no Caddy site appears without the server hostname" test ! -e /etc/caddy/conf.d/t3code-proxy.caddy
check "no required host appears without the server hostname" test ! -e /etc/caddy/required-hosts.d/t3code-proxy.host

reportResults
