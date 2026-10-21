#!/usr/bin/env bash
# Decides whether this run releases, and what (ADR-0014, R148).
#
# Usage: scripts/release-meta.sh [--version V] [--tags "v1.0.0 v1.1.0"] [--event E] [--ref R]
#   Defaults: package.json's version, the remote's v* tags, and
#   GITHUB_EVENT_NAME / GITHUB_REF.
#
# Writes release, version, channel, kind and cws to $GITHUB_OUTPUT (or
# stdout), and the reason to $GITHUB_STEP_SUMMARY when set.
#
# Eligibility depends only on tags, never on the push's `before`, so force
# pushes, multi-commit merges and replaced runs can't skip or repeat one.
# Fails closed: a malformed version or one below the last release fails.
set -euo pipefail

version=$(jq -r '.version' package.json)
tags=""
tags_given=false
event="${GITHUB_EVENT_NAME:-}"
ref="${GITHUB_REF:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) version="$2"; shift 2 ;;
    --tags) tags="$2"; tags_given=true; shift 2 ;;
    --event) event="$2"; shift 2 ;;
    --ref) ref="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ "$tags_given" = false ]; then
  # The remote is the truth; the checkout's own tags may be stale or shallow.
  tags=$(git ls-remote --tags --refs origin 'refs/tags/v*' | sed 's|.*refs/tags/||')
fi

# The last release on AMO before the tags start (1.4.5); `kind` of the first
# release is measured against it.
BASELINE="1.4.5"
# Settled in REL-CI-03: 1.5.0 never ships, and the first release is the beta.
FIRST_RELEASE="1.99.1"
NEVER_SHIPS="1.5.0"

strict='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$1" >> "$GITHUB_STEP_SUMMARY"; fi
  echo "$1" >&2
}

fail() { echo "::error::$1"; summary "**Release failed:** $1"; exit 1; }

# Prints -1, 0 or 1 comparing two strict versions part by part.
compare() {
  local IFS=.
  local -a a=($1) b=($2)
  for i in 0 1 2; do
    if (( a[i] < b[i] )); then echo -1; return; fi
    if (( a[i] > b[i] )); then echo 1; return; fi
  done
  echo 0
}

[[ "$version" =~ $strict ]] || fail "package.json version '$version' isn't MAJOR.MINOR.PATCH with numbers only (REL-CI-01)"

highest=""
tag_exists=false
for tag in $tags; do
  v="${tag#v}"
  if ! [[ "$v" =~ $strict ]]; then
    echo "::warning::ignoring tag $tag, which isn't vMAJOR.MINOR.PATCH"
    continue
  fi
  [ "$v" = "$version" ] && tag_exists=true
  if [ -z "$highest" ] || [ "$(compare "$v" "$highest")" = 1 ]; then highest="$v"; fi
done

if [[ "$version" =~ ^1\.99\.[0-9]+$ ]] || [[ "$version" =~ ^[0-9]+\.[0-9]+\.9[0-9]{2}$ ]]; then
  channel=beta
else
  channel=stable
fi

# Post-launch betas (X.Y.9NN) are Firefox-only: the Chrome item is public by then.
if [[ "$version" =~ ^[0-9]+\.[0-9]+\.9[0-9]{2}$ ]] && ! [[ "$version" =~ ^1\.99\. ]]; then
  cws=false
else
  cws=true
fi

previous="${highest:-$BASELINE}"
IFS=. read -r new_major new_minor _ <<< "$version"
IFS=. read -r old_major old_minor _ <<< "$previous"
if [ "$new_major" != "$old_major" ]; then
  kind=major
elif [ "$new_minor" != "$old_minor" ]; then
  kind=minor
else
  kind=patch
fi

release=false
if [ "$version" = "$NEVER_SHIPS" ]; then
  reason="$version never ships (REL-CI-03); the first release is $FIRST_RELEASE."
elif [ "$tag_exists" = true ]; then
  reason="v$version is already released."
elif [ -n "$highest" ] && [ "$(compare "$version" "$highest")" != 1 ]; then
  fail "version $version is below the last release v$highest"
elif [ -z "$highest" ] && [ "$version" != "$FIRST_RELEASE" ]; then
  reason="there are no releases yet, and the first must be $FIRST_RELEASE, not $version."
elif [ "$event" != "push" ] || [ "$ref" != "refs/heads/main" ]; then
  reason="v$version would release, but only a push to main releases (this is $event on ${ref:-no ref})."
else
  release=true
  reason="releasing v$version: $channel, $kind against v$previous."
fi

summary "**Release:** $release. ${reason^}"

out="${GITHUB_OUTPUT:-/dev/stdout}"
{
  echo "release=$release"
  echo "version=$version"
  echo "channel=$channel"
  echo "kind=$kind"
  echo "cws=$cws"
} >> "$out"
