#!/usr/bin/env bash
# Require an exact, explicit record set before applying the complete plan.
set -euo pipefail
expected="${1:?expected release records are required}"
plan="${2:?release plan is required}"
node --input-type=module - "$expected" "$plan" <<'JS'
import * as fs from 'node:fs';
const [input, file] = process.argv.slice(2);
const expected = input.trim().split(/\s+/).sort();
const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
const tags = plan.tags ?? [];
const actual = tags.map(tag => tag.name).sort();
if (new Set(expected).size !== expected.length || expected.some(tag => !/^t3code-(lib|cli)@\d+\.\d+\.\d+$/.test(tag))) {
  throw new Error('Expected records must be unique supported unit@X.Y.Z names.');
}
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Expected ${expected.join(' ')}, but plan has ${actual.join(' ') || 'no release'}.`);
}
for (const tag of tags) {
  if (tag.name.split('@')[0] !== tag.release_unit) throw new Error('Release unit/tag mismatch.');
}
console.log(`Verified release set: ${actual.join(' ')}`);
JS
