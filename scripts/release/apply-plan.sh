#!/usr/bin/env bash
# Apply only while the live release inputs still reproduce the saved plan.
set -euo pipefail
plan="$(realpath "${1:?saved plan is required}")"
rechecked="$(mktemp)"
cleanup() { node -e 'require("node:fs").unlinkSync(process.argv[1])' "$rechecked"; }
trap cleanup EXIT
intentional plan > "$rechecked"
cmp "$plan" "$rechecked"
intentional apply
