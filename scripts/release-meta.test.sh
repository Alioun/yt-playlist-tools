#!/usr/bin/env bash
# Table test for release-meta.sh. Run: scripts/release-meta.test.sh
set -uo pipefail

cd "$(dirname "$0")/.."
failures=0

# expect <want> <version> <tags> <event> <ref>
#   want is "fail", or the expected "release channel kind cws".
expect() {
  local want="$1" version="$2" tags="$3" event="$4" ref="$5" got
  if got=$(GITHUB_OUTPUT= GITHUB_STEP_SUMMARY= scripts/release-meta.sh \
      --version "$version" --tags "$tags" --event "$event" --ref "$ref" 2>/dev/null); then
    got=$(echo "$got" | awk -F= '$1=="release"{r=$2} $1=="channel"{c=$2} $1=="kind"{k=$2} $1=="cws"{w=$2} END{print r, c, k, w}')
  else
    got=fail
  fi
  if [ "$got" = "$want" ]; then
    echo "ok   $version [$tags] $event $ref -> $got"
  else
    echo "FAIL $version [$tags] $event $ref -> $got, want $want"
    failures=$((failures + 1))
  fi
}

main=refs/heads/main

expect "false stable minor true" 1.5.0   ""                     push $main
expect "false stable patch true" 1.4.6   ""                     push $main
expect "true beta minor true"    1.99.1  ""                     push $main
expect "true stable major true"  2.0.0   "v1.99.1 v1.99.3"      push $main
expect "true stable patch true"  2.0.1   "v1.99.3 v2.0.0"       push $main
expect "true beta minor false"   2.1.901 "v2.0.0 v2.0.1"        push $main
expect "false stable patch true" 2.0.0   "v1.99.3 v2.0.0"       push $main
expect "fail"                    1.99.2  "v1.99.3 v2.0.0"       push $main
expect "fail"                    2.0     ""                     push $main
expect "fail"                    2.0.0-rc1 ""                   push $main
expect "fail"                    02.0.0  ""                     push $main
expect "false beta minor true"   1.99.1  ""                     workflow_dispatch $main
expect "false beta minor true"   1.99.1  ""                     push refs/heads/dev
# Versions compare numerically, not as strings: 1.99.10 is above 1.99.9.
expect "true beta patch true"    1.99.10 "v1.99.1 v1.99.9"      push $main
# main went backwards to a version that was released once.
expect "fail"                    2.0.0   "v2.0.0 v2.0.1"        push $main
# Parts above Chrome's 65535 fail, and such tags are ignored rather than
# overflowing the comparison.
expect "fail"                    70000.0.0 ""                   push $main
expect "fail"                    1.99.18446744073709551617 ""   push $main
expect "true beta patch true"    1.99.2  "v1.99.1 v18446744073709551617.0.0" push $main
# Tags that aren't vMAJOR.MINOR.PATCH are ignored.
expect "true beta patch true"    1.99.2  "v1.99.1 v2.0.0-rc1"   push $main

if [ "$failures" -gt 0 ]; then
  echo "$failures case(s) failed"
  exit 1
fi
echo "All release-meta cases passed."
