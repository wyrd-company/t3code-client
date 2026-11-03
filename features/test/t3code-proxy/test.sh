#!/usr/bin/env bash

set -e

# shellcheck disable=SC1091
source dev-container-features-test-lib

service=/etc/s6-overlay/s6-rc.d/t3code-proxy
# shellcheck disable=SC1091
expected_user="$(. /usr/local/lib/t3code-proxy/config.env && echo "${T3CODE_PROXY_USER}")"

check "automatic selects the remote user of the base image" test "${expected_user}" = vscode
check "the executable is on PATH" test -x /usr/local/bin/t3c-proxy
check "the version prints" bash -c "t3c-proxy --version | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+'"
check "the service is a longrun" grep -qx longrun "${service}/type"
check "the service is in the user bundle" test -f /etc/s6-overlay/user-bundles.d/user/contents.d/t3code-proxy
check "the service depends on base" test -f "${service}/dependencies.d/base"
check "the service runs the launcher as the service user" grep -qx "exec s6-setuidgid ${expected_user} /usr/local/bin/t3code-proxy-service" "${service}/run"
check "the default config path reaches the launcher" grep -qx 'T3CODE_PROXY_CONFIG=/etc/t3code-proxy/config.yml' /usr/local/lib/t3code-proxy/config.env
# shellcheck disable=SC2016
check "the launcher passes the config path" grep -q -- '--config "${T3CODE_PROXY_CONFIG}"$' /usr/local/bin/t3code-proxy-service
check "the Feature declares no ansible edge without Ansible" test ! -e "${service}/dependencies.d/ansible-setup"
check "the Feature declares no server edge without the server" test ! -e "${service}/dependencies.d/t3code-server"
check "the Feature writes no config file" test ! -e /etc/t3code-proxy/config.yml
check "a missing config file stops the launcher" bash -c '! /usr/local/bin/t3code-proxy-service'

reportResults
