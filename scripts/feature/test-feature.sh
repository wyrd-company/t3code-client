#!/usr/bin/env bash
# ---
# relationships:
#   verifies: proxy
# ---
# Feature scenarios on the base image: the options, their validation, the service definitions
# with and without Ansible, and the Caddy files. test-feature-runtime.sh has the runtime scenario.
set -euo pipefail
# shellcheck source=scripts/feature/common.sh
source "$(dirname "$0")/common.sh"

prepare_test_base

installer_image=t3code-proxy-feature-test:installer
build_install() {
  docker build --file "${feature_root}/test/t3code-proxy/install.Dockerfile" \
    --build-arg "TEST_BASE=${test_base}" --build-arg "FIXTURE=$1" \
    --tag "$2" "${feature_root}" >&2
}
build_install absent "${installer_image}"

installer() {
  local image="$1" script="$2"
  shift 2
  docker run --rm --user root --entrypoint bash \
    --mount "type=bind,source=${feature_root}/src/t3code-proxy,target=/feature,readonly" \
    "$@" "${image}" -c "${script}"
}

# Each row: a case name, the options, and the words that the failure must hold.
refuse() {
  local name="$1" options="$2" expected="$3" output
  if output="$(installer "${installer_image}" "env ${options} _REMOTE_USER=vscode /feature/install.sh" 2>&1)"; then
    fail "${name}: the installer accepted it."
  fi
  grep -qF -- "${expected}" <<<"${output}" || fail "${name}: expected '${expected}', got: ${output}"
  printf 'refused: %s\n' "${name}"
}
defaults='VERSION=latest CONFIGPATH=/etc/t3code-proxy/config.yml SERVICEUSER=automatic'
refuse 'a version range' "${defaults} VERSION=^1.0.0" 'version must be'
refuse 'a dist-tag' "${defaults} VERSION=next" 'version must be'
refuse 'a relative config path' "${defaults} CONFIGPATH=config.yml" 'configPath must be an absolute path'
refuse 'an unknown service user' "${defaults} SERVICEUSER=sample-absent" "Requested service user 'sample-absent'"
refuse 'an installed version that differs' "${defaults} VERSION=99.0.0" "does not match resolved version '99.0.0'"

accepted_version="$(installer "${installer_image}" \
  "t3c-proxy --version")"
output="$(installer "${installer_image}" \
  "env ${defaults} VERSION=v${accepted_version} _REMOTE_USER=vscode /feature/install.sh && t3c-proxy --version")"
[ "$(tail -n 1 <<<"${output}")" = "${accepted_version}" ] || fail "A version with a leading v did not install."
printf 'accepted: an exact version with a leading v\n'

# The check for s6-overlay comes before any change.
output="$(docker run --rm --user root --entrypoint bash \
  --mount "type=bind,source=${feature_root}/src/t3code-proxy,target=/feature,readonly" \
  node:24-bookworm-slim -c \
  "env ${defaults} /feature/install.sh; echo \"exit=\$?\"; test ! -e /usr/local/lib/t3code-proxy && echo unchanged" 2>&1)"
grep -q 's6-overlay 3 is required' <<<"${output}" || fail "An image with no s6-overlay was not refused: ${output}"
grep -qx 'exit=1' <<<"${output}" || fail "An image with no s6-overlay did not fail: ${output}"
grep -qx 'unchanged' <<<"${output}" || fail "The installer changed an image with no s6-overlay."
printf 'refused: an image with no s6-overlay\n'

# The Dev Container CLI installs the Feature with its metadata and its dependencies.
devcontainer features test --project-folder "${feature_root}" -f t3code-proxy -i "${test_base}"
