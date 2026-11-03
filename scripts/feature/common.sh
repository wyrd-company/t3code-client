#!/usr/bin/env bash
# ---
# relationships:
#   verifies: proxy
# ---
# Shared setup of the Feature tests: the packed package, a test registry and the test base image.
# shellcheck disable=SC2034
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
feature_root="${repo_root}/features"
base_image="${BASE_IMAGE:-ghcr.io/wyrd-company/devcontainers/base:noble}"
test_base=t3code-proxy-feature-test:noble
workspace="$(mktemp -d)"
cleanup_steps=()

# Pulling public images must not depend on the host's credential helper.
export DOCKER_CONFIG="${workspace}/docker"
mkdir -p "${DOCKER_CONFIG}"
printf '{}' >"${DOCKER_CONFIG}/config.json"
# The Dev Container CLI builds with the plugins of the host's Docker config.
if [ -d "${HOME}/.docker/cli-plugins" ]; then
  ln -s "${HOME}/.docker/cli-plugins" "${DOCKER_CONFIG}/cli-plugins"
fi

fail() {
  printf 'FAILED: %s\n' "$1" >&2
  exit 1
}

cleanup() {
  local step
  for step in "${cleanup_steps[@]}"; do
    eval "${step}" >/dev/null 2>&1 || true
  done
  rm -rf "${workspace:?}"
}
trap cleanup EXIT

# Packs the checkout, starts the registry and builds the test base image. The registry is a
# container on the default bridge, because a host firewall can refuse a container's connection to
# the host. The name holds the process id, so that parallel runs do not meet.
prepare_test_base() {
  local address tarball registry="t3code-proxy-feature-registry-$$"
  pnpm --filter @wyrd-company/t3code-proxy run build >&2
  mkdir -p "${workspace}/package"
  tarball="$("${repo_root}/scripts/release/verify-package.sh" t3code-proxy "${workspace}/package")"
  cleanup_steps+=("docker rm --force ${registry}")
  docker run --detach --name "${registry}" \
    --mount "type=bind,source=${tarball},target=/package.tgz,readonly" \
    --mount "type=bind,source=${repo_root}/scripts/feature/registry.mjs,target=/registry.mjs,readonly" \
    node:24-alpine node /registry.mjs /package.tgz 4873 >/dev/null
  registry_ready() {
    docker logs "${registry}" 2>/dev/null | grep -qx listening
  }
  wait_until 60 registry_ready || fail "The test registry did not start."
  address="$(docker inspect --format '{{.NetworkSettings.Networks.bridge.IPAddress}}' "${registry}")"
  docker build --file "${feature_root}/test/t3code-proxy/base.Dockerfile" \
    --build-arg "BASE_IMAGE=${base_image}" \
    --build-arg "REGISTRY=http://${address}:4873/" \
    --tag "${test_base}" "${feature_root}/test/t3code-proxy" >&2
}

wait_until() {
  local attempts="$1"
  shift
  local _
  for _ in $(seq 1 "${attempts}"); do
    if "$@"; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}
