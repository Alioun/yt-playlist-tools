#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  printf 'Usage: %s <expected directory> <signed directory>\n' "$0" >&2
  exit 2
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

hashes() {
  local dir="$1"
  shift
  (
    cd "$dir"
    find . -type f ! -path './META-INF/*' ! -path './manifest.json' "$@" -print0 \
      | LC_ALL=C sort -z \
      | while IFS= read -r -d '' file; do sha256sum "$file"; done
    # AMO may reserialize the manifest without changing its JSON value.
    jq -Sc . manifest.json | sha256sum
  )
}

# web-ext writes this upload cache into its source directory after packaging.
hashes "$1" ! -path './.amo-upload-uuid' > "$tmp/expected"
hashes "$2" > "$tmp/signed"
diff -u "$tmp/expected" "$tmp/signed"
printf 'The signed build matches the checked payload.\n'
