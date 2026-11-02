#!/usr/bin/env bash
# Plants one break at a time in a scratch copy of the G28 files and runs
# ci.yml's G28 proof step, as this checkout has it, against the copy. Each
# break must fail the named tests, or the step itself. Dummy values only, no
# network, nothing outside the copy.
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
copied=(.github/workflows .github/CODEOWNERS scripts/amo-reviewer-notes.ts tests/integration/amo-reviewer-notes.test.ts tests/integration/fixtures package.json docs/development/releasing.md .audit/2.0-build/ci-reviewer-credentials-design.md .audit/2.0-build/ci-reviewer-credentials-mutations.sh)
proof=$(cd "$repo" && bun --config="$scratch/empty.toml" -e '
  const steps = Bun.YAML.parse(await Bun.file(".github/workflows/ci.yml").text()).jobs.build.steps
  console.log(steps.find(step => step.run?.includes("./tests/integration/amo-reviewer-notes.test.ts")).run)')
missed=0
planted=0

# The failed tests in a Bun junit report, one per line as "fail NAME" or
# "timeout NAME". A timeout is never a catch: it says the test hung, not why.
failures() {
  [[ -f $1 ]] || return 0
  perl -0ne 'while (/<testcase name="([^"]*)"[^>]*?(?:\/>|>(.*?)<\/testcase>)/sg) {
    my ($name, $body) = ($1, $2 // "");
    next unless $body =~ /<failure type="([^"]*)"/;
    my $kind = $1 eq "TimeoutError" ? "timeout" : "fail";
    for ($name) { s/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g; s/&apos;/\x27/g; s/&#10;/\n/g; s/&amp;/&/g }
    print "$kind $name\n" }' "$1"
}

# plant NAME [FILE EDIT ...] -- EXPECTED...
# EDIT is a perl -0 substitution, "base" for the file as it was at the base
# commit, "at:COMMIT" for the file as it was at COMMIT, or "write:TEXT" for a
# new file holding TEXT. Each EXPECTED is a test that must fail, or
# "step:TEXT" for a step that must fail printing TEXT. A row with no EXPECTED
# is a control: the step must pass with no test failed.
plant() {
  local name=$1 copy="$scratch/$1" temp="$scratch/$1-temp" path out status report fails expected
  shift
  [[ $only == "  " || $only == *" $name "* ]] || return 0
  planted=$((planted + 1))
  mkdir -p "$copy" "$temp"
  for path in "${copied[@]}"; do
    mkdir -p "$copy/$(dirname "$path")"
    cp -R "$repo/$path" "$copy/$(dirname "$path")/"
  done
  while [[ $1 != -- ]]; do
    case $2 in
      base) git -C "$repo" show "$base:$1" > "$copy/$1" ;;
      at:*) git -C "$repo" show "${2#at:}:$1" > "$copy/$1" ;;
      write:*) printf '%s\n' "${2#write:}" > "$copy/$1" ;;
      *) perl -0pi -e "$2" "$copy/$1" ;;
    esac
    if cmp -s "$repo/$1" "$copy/$1"; then echo "BROKEN  $name: the edit to $1 changed nothing"; missed=$((missed + 1)); return; fi
    shift 2
  done
  shift
  status=0
  out=$(cd "$copy" && env -i PATH="$PATH" HOME="$temp" RUNNER_TEMP="$temp" bash --noprofile --norc -eo pipefail -c "$proof" 2>&1) || status=$?
  report="$temp/reviewer-login-proof.xml"
  fails=$(failures "$report")
  if [[ $# -eq 0 ]]; then
    if [[ $status -eq 0 && -z $fails ]]; then echo "passed  $name"; else echo "FAILED  $name: the step exited $status"; sed "s/^/        /" <<<"$fails"; missed=$((missed + 1)); fi
    return
  fi
  for expected in "$@"; do
    case $expected in
      step:*) [[ $status -ne 0 && $out == *"${expected#step:}"* ]] ;;
      *) grep '^fail ' <<<"$fails" | grep -qF -- "$expected" ;;
    esac || {
      echo "MISSED  $name: \"$expected\" passed$(grep -q '^timeout ' <<<"$fails" && echo ", but $(grep -c '^timeout ' <<<"$fails") timed out")"
      missed=$((missed + 1))
      return
    }
  done
  echo "caught  $name ($(grep -c '^fail ' <<<"$fails") failing)"
}

script=scripts/amo-reviewer-notes.ts
release=.github/workflows/release.yml
ci=.github/workflows/ci.yml
tests=tests/integration/amo-reviewer-notes.test.ts
owners=.github/CODEOWNERS
docs=docs/development/releasing.md

plant control --
plant old-script "$script" base -- "refuses to run with BUN_CONFIG_VERBOSE_FETCH set"
plant follows-redirects "$script" 's/\n *redirect: "error",//' -- "never follows a redirect"
plant no-timeout "$script" 's/signal: AbortSignal\.timeout\(30_000\)/signal: undefined \&\& AbortSignal.timeout(30_000)/' -- "gives up on an AMO that never answers"
plant no-refusal "$script" 's/Object\.keys\(env\)\.some\(name => UNSAFE\.test\(name\)\)/false/' -- "refuses to run with NODE_TLS_REJECT_UNAUTHORIZED set"
plant logs-tls-keys "$script" 's/\|\^SSLKEYLOGFILE\$//' -- "refuses to run with SSLKEYLOGFILE set"
# Caught only where bash passes the name on to Bun (Homebrew bash 5.3.20 does;
# bash 3.2 stops the step itself, which this row would report as missed).
plant no-refusal-odd-name "$script" 's/Object\.keys\(env\)\.some\(name => UNSAFE\.test\(name\)\)/false/' -- "stops before AMO hears anything when a BUN_ name isn't a shell identifier"
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
plant env-admin-bypass "$docs" 's/\.can_admins_bypass == false and //' -- "the environment checks print true only for amo-reviewer as set up"
plant repo-digest-allowed "$docs" 's/ and \$name != "BUN_SHA256"//' -- "the repository-variable check prints true only when no repository variable can stand in for a digest"
plant ruleset-no-last-push "$docs" 's/ and \.parameters\.require_last_push_approval == true//' -- "the ruleset check prints true only when main needs the owner's review of its last push"
plant ruleset-any-bypass "$docs" 's/ and all\(\.bypass_actors\[\]; \.actor_type == "RepositoryRole" and \.actor_id == 5\)//' -- "the bypass check prints true only for a ruleset no one but the owner can bypass"
plant digest-without-pipefail "$docs" 's/\(set -euo pipefail(\n +digest=)/(set -eu$1/' -- "the digest command stores the approved script's digest, and nothing when git show fails"
plant digest-round-1 "$docs" at:4684a5621 -- "the digest command stores the approved script's digest, and nothing when git show fails"
plant old-runner \
  "$script" base \
  "$release" 's/          digest=\$REVIEWER_NOTES_SHA256\n          script=[^\n]*\n          metadata=[^\n]*\n          version=\$VERSION\n(?:.*\n)*?          exec "\$bun" [^\n]*\n/          cp scripts\/amo-reviewer-notes.ts "\$RUNNER_TEMP\/"\n          cd "\$RUNNER_TEMP"\n          echo "\$REVIEWER_NOTES_SHA256  amo-reviewer-notes.ts" | shasum -a 256 --check --status \\\n            || { echo "::error::amo-reviewer-notes.ts is not the approved version (G28)"; exit 1; }\n          bun --no-env-file amo-reviewer-notes.ts fill "\$VERSION" "\$GITHUB_WORKSPACE\/dist\/amo-metadata.json"\n/' -- \
  "strips BUN_CONFIG_VERBOSE_FETCH" "strips BUN_OPTIONS" "loads no bunfig.toml planted" "strips NODE_TLS_REJECT_UNAUTHORIZED" "strips NODE_EXTRA_CA_CERTS"
plant job-level-keys "$ci" base -- "hold no secret or job token in a workflow- or job-level env"
plant old-leak-check "$tests" 's/forms\(value\)\.some\(form => text\.includes\(form\)\)/text.includes(value) || text.includes(JSON.stringify(value).slice(1, -1))/' -- "finds each value in every form a log could carry it"

# Bun tries .tsx before .ts for an import without an extension. The planted
# file exports the imported names, as Bun links them before it runs the file.
plant extensionless-import "$tests" 's/"\.\/fixtures\/fake-amo\.ts"/".\/fixtures\/fake-amo"/' -- "imports the fake AMO by its full name"
plant planted-tsx "$tests" 's/"\.\/fixtures\/fake-amo\.ts"/".\/fixtures\/fake-amo"/' tests/integration/fixtures/fake-amo.tsx 'write:export const startFakeAmo = 0, untrustedCertificate = 0; process.exit(0)' -- \
  "step:::error::the G28 proof did not pass all"
plant planted-tsx-beside-full-name tests/integration/fixtures/fake-amo.tsx 'write:export const startFakeAmo = 0, untrustedCertificate = 0; process.exit(0)' --
plant metadata-in-proof "$tests" 's/\z/const metadataScript = join(root, "scripts\/amo-metadata.ts")\n/' -- "reads or runs only files the approval covers"
plant fixtures-unowned "$owners" 's/^\/tests\/integration\/fixtures\/\*\* \@Alioun\n//m' -- "sends every file the approval covers to the owner"
plant fixture-file-owned "$owners" 's/^\/tests\/integration\/fixtures\/\*\* \@Alioun$/\/tests\/integration\/fixtures\/fake-amo.ts \@Alioun/m' -- \
  "sends every file the approval covers to the owner"
# The CI proof step and its count.
plant proof-counts-fewer "$ci" 's/tests="(\d+)"/"tests=\"" . ($1 - 1) . "\""/e' -- "step:::error::the G28 proof did not pass all"
plant proof-ignores-count "$ci" 's/(the G28 proof did not pass all \d+ of its tests"; )exit 1/${1}exit 0/' -- "fails when one test fewer runs"
plant proof-or-true "$ci" 's/(--reporter-outfile="\$report" \.\/tests\/integration\/amo-reviewer-notes\.test\.ts)\n.*?\n.*?\n/$1 || true\n/s' -- \
  "fails when one test fails"
plant proof-continue-on-error "$ci" 's/(      - name: Test the reviewer-login secret flow \(G28\)\n)/$1        continue-on-error: true\n/' -- "is a plain step whose failure fails the build job"
plant proof-if "$ci" 's/(      - name: Test the reviewer-login secret flow \(G28\)\n)/$1        if: github.event_name == \x27push\x27\n/' -- "is a plain step whose failure fails the build job"
plant proof-job-continue-on-error "$ci" 's/(  build:\n    runs-on: ubuntu-latest\n)/$1    continue-on-error: true\n/' -- "is a plain step whose failure fails the build job"
plant proof-cached-bun "$ci" 's/\n *# The G28 proof below runs on this Bun.*?\n.*?\n *no-cache: true//s' -- "runs on the Bun package.json declares, without a cache"

# The reviewer jobs' shape.
plant reviewer-latest-image "$release" 's/(  check-reviewer-login:\n(?:.*\n)*?    runs-on: )ubuntu-24\.04/${1}ubuntu-latest/' -- "hold exactly the keys and values the approval covers"
plant reviewer-container "$release" 's/(  fill-reviewer-notes:\n(?:.*\n)*?    runs-on: ubuntu-24\.04\n)/${1}    container: ubuntu:24.04\n/' -- "hold exactly the keys and values the approval covers"
plant reviewer-job-defaults "$release" 's/(  check-reviewer-login:\n(?:.*\n)*?    runs-on: ubuntu-24\.04\n)/${1}    defaults:\n      run:\n        shell: sh {0}\n/' -- "hold exactly the keys and values the approval covers"
plant reviewer-step-shell "$release" 's/(      - name: Put the reviewer test account into the reviewer notes\n)/${1}        shell: sh {0}\n/' -- "hold exactly the keys and values the approval covers"
plant reviewer-step-continue "$release" 's/(      - name: Check the reviewer test account\n)/${1}        continue-on-error: true\n/' -- "hold exactly the keys and values the approval covers"
plant reviewer-step-env "$release" 's/(          BUN_SHA256: \$\{\{ vars\.BUN_SHA256 \}\}\n        run: \|\n          digest=\$REVIEWER_NOTES_SHA256\n          script=)/          BUN_CONFIG_VERBOSE_FETCH: curl\n$1/' -- "hold exactly the keys and values the approval covers"
plant workflow-defaults "$release" 's/^jobs:\n/defaults:\n  run:\n    shell: sh {0}\n\njobs:\n/m' -- "set no workflow-level defaults"

# GitHub reads context and secret names in any case.
plant upper-bulk-secrets "$ci" 's/(VERSION: \$\{\{ steps\.version\.outputs\.version \}\}\n)/$1          ALL: \$\{\{ toJSON(SECRETS) \}\}\n/' -- "read secrets and the job token only by name"
plant upper-job-token "$release" 's/(      CHANNEL: \$\{\{ needs\.meta\.outputs\.channel \}\}\n)/$1      GH_TOKEN: \$\{\{ GITHUB.TOKEN \}\}\n/' -- "hold no secret or job token in a workflow- or job-level env"
plant lower-login-name "$ci" 's/(VERSION: \$\{\{ steps\.version\.outputs\.version \}\}\n)/$1          LOGIN: \$\{\{ secrets.amo_reviewer_login \}\}\n/' -- "give AMO_REVIEWER_LOGIN only to the two reviewer steps"

# A CODEOWNERS pattern without a slash matches at any depth, and the last match wins.
plant owners-basename-later "$owners" 's/\z/releasing.md \@dummy-other\n/' -- "sends every file the approval covers to the owner"
plant owners-directory-later "$owners" 's/\z/fixtures\/\n/' -- "sends every file the approval covers to the owner"
plant old-owners-matcher "$tests" 's/codeOwnerRules\.findLast\(rule => codeOwnersMatch\(rule\.pattern, path\)\)/codeOwnerRules.findLast(rule => new Bun.Glob(rule.pattern.replace(\/^\\\/\/, "")).match(path))/; s/expect\(codeOwnersMatch\(pattern, path\)\)/expect(new Bun.Glob(pattern.replace(\/^\\\/\/, "")).match(path))/' -- \
  "reads releasing.md against docs/development/releasing.md as GitHub does" "reads apps/ against deep/apps/main.ts as GitHub does"

# The owner's setup commands.
plant ruleset-no-build-check "$docs" 's/ and any\(\.\[\]; \.type == "required_status_checks" and any\(\.parameters\.required_status_checks\[\]; \.context == "build"\)\)//' -- \
  "the ruleset check prints true only when main needs the owner's review of its last push"
plant repo-digest-any-case "$docs" 's/\(\.name \| ascii_upcase\) as \$name \| \$name != "REVIEWER_NOTES_SHA256" and \$name != "BUN_SHA256"/.name != "REVIEWER_NOTES_SHA256" and .name != "BUN_SHA256"/' -- \
  "the repository-variable check prints true only when no repository variable can stand in for a digest"
plant ruleset-loop-silent "$docs" 's/^ *\[ -n "\$ids" \] \|\| echo false\n//m' -- "the ruleset commands print false when no ruleset applies to main"

echo "$planted rows, $missed missed"
exit $((missed > 0))
