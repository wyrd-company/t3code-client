#!/usr/bin/env bash
# ---
# relationships:
#   verifies: proxy
# ---
# The s6-rc dependency on `ansible-setup`, with a stand-in for the Ansible Feature's oneshot.
set -euo pipefail
# shellcheck source=scripts/feature/common.sh
source "$(dirname "$0")/common.sh"

prepare_test_base

config="${workspace}/config.yml"
printf 'upstream: http://127.0.0.1:3773\nusers:\n  - name: Alice\n    port: 4101\n' >"${config}"
chmod 0644 "${config}"

build() {
  docker build --file "${feature_root}/test/t3code-proxy/install.Dockerfile" \
    --build-arg "TEST_BASE=${test_base}" --build-arg "FIXTURE=$1" --tag "$2" "${feature_root}" >&2
}
present=t3code-proxy-feature-test:ansible-present
absent=t3code-proxy-feature-test:ansible-absent
build present "${present}"
build absent "${absent}"

edge=/etc/s6-overlay/s6-rc.d/t3code-proxy/dependencies.d/ansible-setup
docker run --rm --entrypoint test "${present}" -f "${edge}" || fail "The service has no edge to ansible-setup."
docker run --rm --entrypoint test "${absent}" ! -e "${edge}" || fail "The service has an edge without Ansible."

container=""
start() {
  container="t3code-proxy-feature-ansible-${RANDOM}-$$"
  cleanup_steps+=("docker rm --force ${container}")
  docker run --detach --name "${container}" --env "ANSIBLE_FIXTURE_MODE=$1" \
    --mount "type=bind,source=${config},target=/etc/t3code-proxy/config.yml,readonly" "$2" >/dev/null
}
# A variable and not a pipe: with pipefail, `grep -q` that stops early can fail the pipe.
logged() {
  local logs
  logs="$(docker logs "${container}" 2>&1)"
  grep -qF -- "s6-rc: info: service $1" <<<"${logs}"
}

start pass "${absent}"
wait_until 120 logged 't3code-proxy successfully started' || fail "The service did not start without Ansible."
docker rm --force "${container}" >/dev/null

start pass "${present}"
wait_until 240 logged 't3code-proxy successfully started' || fail "The service did not start after ansible-setup."
# s6-rc can log the oneshot's end after a dependent starts, so compare with the time that the
# oneshot itself wrote.
finished="$(docker exec "${container}" cat /run/ansible-fixture/finished)"
logs="$(docker logs --timestamps "${container}" 2>&1)"
line="$(grep -F 's6-rc: info: service t3code-proxy: starting' <<<"${logs}")"
began="$(date -u -d "${line%% *}" +%s%N)"
[ "${began}" -ge "${finished}" ] || fail "The service started before ansible-setup finished."
docker rm --force "${container}" >/dev/null

start fail "${present}"
wait_until 240 docker exec "${container}" test -e /run/ansible-fixture/failed || fail "ansible-setup never failed."
sleep 10
if logged 't3code-proxy: starting'; then
  fail "The service started although ansible-setup failed."
fi
docker rm --force "${container}" >/dev/null

printf 'The service follows the ansible-setup dependency.\n'
