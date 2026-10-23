#!/usr/bin/env bash
# Asserts the built manifests are what the stores expect.
#
# Usage: scripts/check-manifests.sh <output dir>...
#   e.g. scripts/check-manifests.sh .output/chrome-mv3 .output/firefox-mv3
#
# Each dir is checked by its name: `chrome-*` or `firefox-*`, and a
# `-beta` suffix marks the Firefox beta build (REL-CI-10).
set -euo pipefail

[ "$#" -gt 0 ] || { echo "usage: $0 <output dir>..." >&2; exit 2; }

fail() { echo "::error::$1"; exit 1; }

BETA_UPDATE_URL="https://alioun.github.io/yt-playlist-tools/beta/updates.json"
package_version=$(jq -r '.version' package.json)

for dir in "$@"; do
  manifest="$dir/manifest.json"
  target=$(basename "$dir")
  [ -f "$manifest" ] || fail "$manifest not found"

  # Firefox is the trap here: WXT defaults it to MV2 unless pinned.
  version=$(jq -r '.manifest_version' "$manifest")
  [ "$version" = "3" ] || fail "$target is MV$version, expected MV3"

  # package.json is the one source of the version (REL-CI-02).
  v=$(jq -r '.version' "$manifest")
  [ "$v" = "$package_version" ] || fail "$target has version $v, package.json has $package_version"

  jq -e '.permissions | index("identity") | not' "$manifest" > /dev/null \
    || fail "$target still requests OAuth identity access"
  jq -e '.host_permissions == ["https://www.youtube.com/*"]' "$manifest" > /dev/null \
    || fail "$target must request only YouTube site access"
  jq -e '(.content_scripts // []) | length == 0' "$manifest" > /dev/null \
    || fail "$target injects scripts before consent"

  case "$target" in
    chrome-*)
      # Chrome needs a service worker.
      jq -e '.background.service_worker' "$manifest" > /dev/null \
        || fail "$target is missing background.service_worker"

      # Session jobs run in YouTube tabs.
      jq -e '.host_permissions | length > 0' "$manifest" > /dev/null \
        || fail "$target is missing host_permissions"
      ;;
    firefox-*)
      # Firefox MV3 needs an event page.
      jq -e '.background.scripts' "$manifest" > /dev/null \
        || fail "$target is missing background.scripts"

      # Losing this ID would break updates for every existing AMO user.
      id=$(jq -r '.browser_specific_settings.gecko.id' "$manifest")
      [ "$id" = "{cc70cd21-2cc6-444b-bd89-496909346091}" ] \
        || fail "$target gecko id changed: $id"

      # AMO rejects update_url in listed versions; only the beta has one.
      if [[ "$target" == *-beta ]]; then
        update_url=$(jq -r '.browser_specific_settings.gecko.update_url // empty' "$manifest")
        [ "$update_url" = "$BETA_UPDATE_URL" ] \
          || fail "$target must have update_url $BETA_UPDATE_URL, has '${update_url}'"
      else
        # Presence, not value: an empty or null update_url is still one.
        jq -e '.browser_specific_settings.gecko | has("update_url") | not' "$manifest" > /dev/null \
          || fail "$target is not a beta build but has update_url"
      fi
      ;;
    *)
      fail "don't know how to check $target"
      ;;
  esac

  echo "$target: ok"
done

echo "All manifest assertions passed."
