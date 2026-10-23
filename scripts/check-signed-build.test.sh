#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
checker="${1:-scripts/check-signed-build.sh}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
failures=0

fixture() {
  local dir
  dir=$(mktemp -d "$tmp/case.XXXXXX")
  expected="$dir/expected"
  actual="$dir/actual"
  mkdir "$expected" "$actual"
  printf '%s\n' '{"manifest_version":3,"name":"Test","version":"1.5.0.95","permissions":["storage","tabs"]}' > "$expected/manifest.json"
  printf '%s\n' 'console.log("built");' > "$expected/background.js"
  cp -R "$expected/." "$actual/"
}

expect() {
  local want="$1" name="$2" got=fail
  if bash "$checker" "$expected" "$actual" > "$tmp/output" 2>&1; then got=pass; fi
  if [ "$got" = "$want" ]; then
    printf 'ok   %s\n' "$name"
  else
    printf 'FAIL %s, got %s, want %s\n' "$name" "$got" "$want"
    failures=$((failures + 1))
  fi
}

fixture
expect pass 'identical payloads'

fixture
jq . "$expected/manifest.json" > "$expected/formatted.json"
mv "$expected/formatted.json" "$expected/manifest.json"
printf '%s' '{"manifest_version":3,"name":"Test","version":"1.5.0.95","permissions":["storage","tabs"]}' > "$actual/manifest.json"
printf '%s' '{"uploadUuid":"local-test"}' > "$expected/.amo-upload-uuid"
mkdir "$actual/META-INF"
printf '%s' 'signature' > "$actual/META-INF/mozilla.rsa"
expect pass 'first signing ignores local upload state and manifest formatting'

fixture
printf '%s' '{"permissions":["storage","tabs"],"version":"1.5.0.95","name":"Test","manifest_version":3}' > "$actual/manifest.json"
expect pass 'downloaded build ignores manifest key order without local upload state'

fixture
printf '%s' 'console.log("changed");' > "$actual/background.js"
expect fail 'changed payload bytes'

fixture
mv "$actual/background.js" "$actual/renamed.js"
expect fail 'renamed payload file'

fixture
printf '%s' 'extra' > "$actual/extra.js"
expect fail 'extra payload file'

fixture
mv "$actual/background.js" "$tmp/missing-background.js"
expect fail 'missing payload file'

fixture
printf '%s' '{"manifest_version":3,"name":"Test","version":"1.5.0.96","permissions":["storage","tabs"]}' > "$actual/manifest.json"
expect fail 'changed manifest version'

fixture
printf '%s' '{"manifest_version":3,"name":"Test","version":"1.5.0.95","permissions":["tabs","storage"]}' > "$actual/manifest.json"
expect fail 'changed manifest array order'

fixture
printf '%s' '{broken' > "$actual/manifest.json"
expect fail 'invalid signed manifest'

fixture
printf '%s' '{broken' > "$expected/manifest.json"
expect fail 'invalid expected manifest'

fixture
mv "$actual/manifest.json" "$tmp/missing-manifest.json"
expect fail 'missing signed manifest'

fixture
printf '%s' 'unexpected' > "$actual/.amo-upload-uuid"
expect fail 'upload state inside signed payload'

fixture
printf '%s' 'unexpected' > "$actual/.hidden-payload"
expect fail 'unexpected hidden payload file'

fixture
mv "$expected/background.js" "$expected/background script.js"
mv "$actual/background.js" "$actual/background script.js"
expect pass 'payload filenames with spaces'

if [ "$failures" -gt 0 ]; then
  printf '%s case(s) failed\n' "$failures"
  exit 1
fi
printf 'All signed-build cases passed.\n'
