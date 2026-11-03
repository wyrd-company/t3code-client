#!/usr/bin/env bash

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "$0")/common.sh"

package=@wyrd-company/t3code-proxy

require_root
check_debian_family
ensure_s6_overlay

version="${VERSION:-latest}"
version="${version#v}"
if [ "${version}" != latest ] \
    && ! [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]; then
    err "version must be 'latest' or an exact version, such as 1.2.3."
fi

config_path="${CONFIGPATH:-/etc/t3code-proxy/config.yml}"
case "${config_path}" in
    *$'\n'*|*$'\r'*) err "configPath must be on one line." ;;
    /*) ;;
    *) err "configPath must be an absolute path." ;;
esac

service_user="$(pick_service_user "${SERVICEUSER:-automatic}")"
service_home="$(getent passwd "${service_user}" | cut -d: -f6)"
[ -n "${service_home}" ] || err "Unable to resolve the home directory for ${service_user}."

command -v node >/dev/null 2>&1 || err "Node.js is required. The Node Feature supplies it."
command -v npm >/dev/null 2>&1 || err "npm is required. The Node Feature supplies it."
node_dir="$(dirname "$(command -v node)")"

resolved_version="$(npm view "${package}@${version}" version)"
[ -n "${resolved_version}" ] || err "Unable to resolve ${package}@${version}."

lib_dir=/usr/local/lib/t3code-proxy
log "Installing ${package}@${resolved_version}"
install -d -m 0755 "${lib_dir}"
npm install --global --prefix "${lib_dir}/npm" --ignore-scripts --no-fund --no-audit \
    "${package}@${resolved_version}"
ln -sf "${lib_dir}/npm/bin/t3c-proxy" /usr/local/bin/t3c-proxy

installed_version="$(PATH="${node_dir}:${PATH}" /usr/local/bin/t3c-proxy --version)"
[ "${installed_version}" = "${resolved_version}" ] \
    || err "Installed version '${installed_version}' does not match resolved version '${resolved_version}'."

install -m 0755 "$(dirname "$0")/write-caddy-sites" "${lib_dir}/write-caddy-sites"
install -m 0755 "$(dirname "$0")/t3code-proxy-service" /usr/local/bin/t3code-proxy-service

cat >"${lib_dir}/config.env" <<CONFIG
T3CODE_PROXY_CONFIG=$(printf '%q' "${config_path}")
T3CODE_PROXY_USER=$(printf '%q' "${service_user}")
T3CODE_PROXY_HOME=$(printf '%q' "${service_home}")
T3CODE_PROXY_NODE_DIR=$(printf '%q' "${node_dir}")
CONFIG
chmod 0644 "${lib_dir}/config.env"

service_dir=/etc/s6-overlay/s6-rc.d/t3code-proxy
install -d -m 0755 "${service_dir}/dependencies.d"
printf 'longrun\n' >"${service_dir}/type"
touch "${service_dir}/dependencies.d/base"
for dependency in ansible-setup t3code-server; do
    if [ -d "/etc/s6-overlay/s6-rc.d/${dependency}" ]; then
        touch "${service_dir}/dependencies.d/${dependency}"
    fi
done

printf -v quoted_user '%q' "${service_user}"
cat >"${service_dir}/run" <<RUN
#!/command/with-contenv bash
exec s6-setuidgid ${quoted_user} /usr/local/bin/t3code-proxy-service
RUN
chmod 0755 "${service_dir}/run"
touch /etc/s6-overlay/user-bundles.d/user/contents.d/t3code-proxy

# The service writes its own Caddy files, so it needs no root step.
if getent group caddy-config >/dev/null 2>&1 && [ "${service_user}" != root ]; then
    usermod -aG caddy-config "${service_user}"
fi

log "Installed t3c-proxy ${installed_version} for ${service_user}. It reads ${config_path}."
