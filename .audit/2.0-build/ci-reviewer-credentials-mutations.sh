#!/usr/bin/env bash
# Plants one break at a time in a scratch copy of the G28 files and runs
# tests/integration/amo-reviewer-notes.test.ts against it. Each break must
# fail the named test. Dummy values only, no network, nothing outside the copy.
#
# Usage: .audit/2.0-build/ci-reviewer-credentials-mutations.sh [base commit] [row...]
# The base commit (default 14365d0d7, before the first review's fixes) supplies
# the old script, launcher and leak check for the "old code" rows. Naming rows
# runs only those.
set -euo pipefail

repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
base=${1:-14365d0d7}
shift $(($# > 0 ? 1 : 0))
only=" $* "
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
: > "$scratch/empty.toml"
echo '{}' > "$scratch/empty.json"
copied=(.github/workflows .github/CODEOWNERS scripts/amo-reviewer-notes.ts scripts/amo-metadata.ts tests/integration/amo-reviewer-notes.test.ts tests/integration/fixtures/fake-amo.ts package.json docs/development/releasing.md .audit/2.0-build/ci-reviewer-credentials-design.md .audit/2.0-build/ci-reviewer-credentials-mutations.sh)
missed=0
planted=0

# plant NAME FILE EDIT [FILE EDIT ...] -- TEST...
# EDIT is a perl -0 substitution, "base" for the file as it was at the base
# commit, or "at:COMMIT" for the file as it was at COMMIT. Every TEST named
# must fail.
plant() {
  local name=$1 copy="$scratch/$1" path out expected
  shift
  [[ $only == "  " || $only == *" $name "* ]] || return 0
  planted=$((planted + 1))
  mkdir -p "$copy"
  for path in "${copied[@]}"; do
    mkdir -p "$copy/$(dirname "$path")"
    cp -R "$repo/$path" "$copy/$(dirname "$path")/"
  done
  while [[ $1 != -- ]]; do
    case $2 in
      base) git -C "$repo" show "$base:$1" > "$copy/$1" ;;
      at:*) git -C "$repo" show "${2#at:}:$1" > "$copy/$1" ;;
      *) perl -0pi -e "$2" "$copy/$1" ;;
    esac
    if cmp -s "$repo/$1" "$copy/$1"; then echo "BROKEN  $name: the edit to $1 changed nothing"; missed=$((missed + 1)); return; fi
    shift 2
  done
  shift
  # As ci.yml runs it: no bunfig.toml, no tsconfig.json.
  out=$(cd "$copy" && bun --config="$scratch/empty.toml" test --no-env-file --tsconfig-override="$scratch/empty.json" ./tests/integration/amo-reviewer-notes.test.ts 2>&1 || true)
  for expected in "$@"; do
    if ! grep '^(fail)' <<<"$out" | grep -qF -- "$expected"; then
      echo "MISSED  $name: \"$expected\" passed"
      missed=$((missed + 1))
      return
    fi
  done
  echo "caught  $name ($(grep -c '^(fail)' <<<"$out") failing)"
}

script=scripts/amo-reviewer-notes.ts
release=.github/workflows/release.yml
ci=.github/workflows/ci.yml
tests=tests/integration/amo-reviewer-notes.test.ts
owners=.github/CODEOWNERS

plant old-script "$script" base -- "refuses to run with BUN_CONFIG_VERBOSE_FETCH set"
plant follows-redirects "$script" 's/\n *redirect: "error",//' -- "never follows a redirect"
plant no-timeout "$script" 's/signal: AbortSignal\.timeout\(30_000\)/signal: undefined \&\& AbortSignal.timeout(30_000)/' -- "gives up on an AMO that never answers"
plant no-refusal "$script" 's/Object\.keys\(env\)\.some\(name => UNSAFE\.test\(name\)\)/false/' -- "refuses to run with NODE_TLS_REJECT_UNAUTHORIZED set"
plant logs-tls-keys "$script" 's/\|\^SSLKEYLOGFILE\$//' -- "refuses to run with SSLKEYLOGFILE set"
plant side-effect-import "$script" 's/^(import \{ readFileSync \} from "node:fs"\n)/$1import "node:vm"\n/m' -- "imports only Node built-ins"
plant re-export "$script" 's/\z/export * from "node:os"\n/' -- "imports only Node built-ins"
# The module name is built at run time, so neither Bun's import scanner nor a
# search for "child_process" sees it.
plant builtin-module "$script" 's/\z/process.getBuiltinModule(["node:child", "process"].join("_"))\n/' -- "imports only Node built-ins"
plant meta-require "$script" 's/\z/import.meta.require(["node:child", "process"].join("_"))\n/' -- "imports only Node built-ins"
plant computed-require "$script" 's/\z/require(["node:child", "process"].join("_"))\n/' -- "imports only Node built-ins"
plant computed-import "$script" 's/\z/await import(["node:child", "process"].join("_"))\n/' -- "imports only Node built-ins"
plant keeps-environment "$release" 's/ *for name in \$\(compgen -e\); do\n.*?\n *done\n//sg' -- \
  "strips BUN_CONFIG_VERBOSE_FETCH" "strips BUN_OPTIONS" "strips NODE_TLS_REJECT_UNAUTHORIZED" "strips NODE_EXTRA_CA_CERTS"
plant exports-early "$release" 's/export -n "\$name"/:/g' -- "spawns mktemp, cp and shasum without the login or the AMO keys"
plant runs-in-runner-temp "$release" 's/work=\$\(mktemp -d "\$temp\/reviewer-notes\.XXXXXX"\)/work=\$temp/g; s/ --config=empty\.toml//g' -- "loads no bunfig.toml planted"
plant reads-parent-tsconfig "$release" 's/ --tsconfig-override=empty\.json//g' -- \
  "loads no _temp/tsconfig.json planted above the script" "loads no _temp/jsconfig.json planted above the script" \
  "loads no tsconfig.json planted above the script" "loads no jsconfig.json planted above the script"
plant unchecked-bun "$release" 's/ *if \[\[ -n \$bun_digest \]\]; then\n.*?\n *fi\n//sg' -- \
  "check-reviewer-login refuses a Bun that isn't at vars.BUN_SHA256" "fill-reviewer-notes refuses a Bun that isn't at vars.BUN_SHA256"
plant bun-digest-unchecked-format "$release" 's/\[\[ -z \$bun_digest \|\| \$bun_digest =~ \^\[0-9a-f\]\{64\}\$ \]\]/true/g' -- "refuses a vars.BUN_SHA256 that isn't a digest"
plant bun-digest-wrong-file "$release" 's/echo "\$bun_digest  \$bun"/echo "\$bun_digest  amo-reviewer-notes.ts"/g' -- "runs the script once Bun matches vars.BUN_SHA256"
plant gate-open "$release" 's/if: false && github\.event_name/if: github.event_name/' -- "can't be turned on while an action in them is unpinned"
plant check-gate-widened "$release" 's/(if: false && github\.event_name == \x27push\x27[^\n]*)/$1 || vars.G28_ON == \x27true\x27/' -- \
  "stay off until the owner approves G28" "can't be turned on while an action in them is unpinned"
plant fill-gate-widened "$release" 's/(if: false && needs\.check-reviewer-login[^\n]*)/$1 || always()/' -- \
  "stay off until the owner approves G28" "can't be turned on while an action in them is unpinned"
plant digest-in-repo "$release" 's/\$\{\{ vars\.REVIEWER_NOTES_SHA256 \}\}/46372e7ff86b8b5eb647c8fc616ec32167ac341848aae2d5fa4416eaa525ee06/' -- "hold no digest of the script"
plant no-digest-check "$release" 's/\[\[ \$digest =~ \^\[0-9a-f\]\{64\}\$ \]\]/true/g' -- "refuses to run while vars.REVIEWER_NOTES_SHA256 is unset"
plant shared-environment "$release" 's/(  submit-amo:\n(?:.*\n)*?    environment: )amo\n/$1amo-reviewer\n/' -- "let only the two reviewer jobs into the amo-reviewer environment"
plant computed-environment "$ci" 's/^jobs:\n/jobs:\n  sneak:\n    runs-on: ubuntu-latest\n    environment: \$\{\{ format(\x27amo-{0}\x27, \x27reviewer\x27) \}\}\n    steps:\n      - run: "true"\n/m' -- \
  "name each environment literally, and call reusable workflows only from this repository"
plant foreign-workflow "$ci" 's/^jobs:\n/jobs:\n  sneak:\n    uses: other\/repo\/.github\/workflows\/x.yml\@0000000000000000000000000000000000000000\n/m' -- \
  "name each environment literally, and call reusable workflows only from this repository"
plant bulk-secrets "$ci" 's/(VERSION: \$\{\{ steps\.version\.outputs\.version \}\}\n)/$1          ALL: \$\{\{ toJSON(secrets) \}\}\n/' -- "read secrets and the job token only by name"
plant indexed-secret "$ci" 's/(VERSION: \$\{\{ steps\.version\.outputs\.version \}\}\n)/$1          LOGIN: \$\{\{ secrets[\x27AMO_REVIEWER_LOGIN\x27] \}\}\n/' -- "read secrets and the job token only by name"
plant bulk-github "$ci" 's/(VERSION: \$\{\{ steps\.version\.outputs\.version \}\}\n)/$1          ALL: \$\{\{ toJSON(github) \}\}\n/' -- "read secrets and the job token only by name"
plant job-level-token "$release" 's/(      CHANNEL: \$\{\{ needs\.meta\.outputs\.channel \}\}\n)/$1      GH_TOKEN: \$\{\{ github.token \}\}\n/' -- "hold no secret or job token in a workflow- or job-level env"
plant ci-reads-bunfig "$ci" 's/bun --config="\$RUNNER_TEMP\/empty\.toml" test/bun test/' -- "loads no bunfig.toml preload and no tsconfig.json from the checkout"
plant ci-reads-tsconfig "$ci" 's/ --tsconfig-override="\$RUNNER_TEMP\/empty\.json"//' -- "loads no bunfig.toml preload and no tsconfig.json from the checkout"
plant ci-after-install "$ci" 's/(      # G28\x27s secret-flow tests.*?\n\n)(      - name: Install dependencies\n.*?\n\n)/$2$1/s' -- "runs before bun install"
plant runner-unowned "$owners" 's/^\/\.audit\/2\.0-build\/ci-reviewer-credentials-mutations\.sh \@Alioun\n//m' -- "sends every file the approval covers to the owner"
plant docs-unowned-later "$owners" 's/\z/\/docs\/development\/releasing.md\n/' -- "sends every file the approval covers to the owner"
plant old-runner \
  "$script" base \
  "$release" 's/          digest=\$REVIEWER_NOTES_SHA256\n          script=[^\n]*\n          metadata=[^\n]*\n          version=\$VERSION\n(?:.*\n)*?          exec "\$bun" [^\n]*\n/          cp scripts\/amo-reviewer-notes.ts "\$RUNNER_TEMP\/"\n          cd "\$RUNNER_TEMP"\n          echo "\$REVIEWER_NOTES_SHA256  amo-reviewer-notes.ts" | shasum -a 256 --check --status \\\n            || { echo "::error::amo-reviewer-notes.ts is not the approved version (G28)"; exit 1; }\n          bun --no-env-file amo-reviewer-notes.ts fill "\$VERSION" "\$GITHUB_WORKSPACE\/dist\/amo-metadata.json"\n/' -- \
  "strips BUN_CONFIG_VERBOSE_FETCH" "strips BUN_OPTIONS" "loads no bunfig.toml planted" "strips NODE_TLS_REJECT_UNAUTHORIZED" "strips NODE_EXTRA_CA_CERTS"
plant job-level-keys "$ci" base -- "hold no secret or job token in a workflow- or job-level env"
plant old-leak-check "$tests" 's/forms\(value\)\.some\(form => text\.includes\(form\)\)/text.includes(value) || text.includes(JSON.stringify(value).slice(1, -1))/' -- "finds each value in every form a log could carry it"

echo "$planted planted, $missed missed"
exit $((missed > 0))
