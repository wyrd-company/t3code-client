#!/usr/bin/env bash

set -e

# shellcheck disable=SC1091
source dev-container-features-test-lib

check "serviceUser reaches the service" grep -qx 'exec s6-setuidgid root /usr/local/bin/t3code-proxy-service' /etc/s6-overlay/s6-rc.d/t3code-proxy/run
check "configPath reaches the launcher" grep -qx 'T3CODE_PROXY_CONFIG=/opt/sample/proxy.yml' /usr/local/lib/t3code-proxy/config.env

reportResults
