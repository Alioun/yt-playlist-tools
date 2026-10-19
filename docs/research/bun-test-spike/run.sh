#!/bin/sh
# Re-runs every spike experiment and prints a compact summary of each.
# Needs: `bun install`, then `bun add -d @happy-dom/global-registrator@20.14.5`
# (not committed). Run from anywhere: sh docs/research/bun-test-spike/run.sh
cd "$(dirname "$0")" || exit 1
SPIKE=$(pwd)
ROOT=$(cd ../../.. && pwd)
summary() { grep -aE "^\(fail\)|^(error|ReferenceError|TypeError):|Expected:|Received:| pass$| fail$| skip$|^Ran " | grep -av "^ 0 skip"; }

echo "bun $(bun --version)"

echo; echo "### 0. Baseline: today's storage test, no setup (from the repo root)"
(cd "$ROOT" && bun test ./src/lib/storage.test.ts 2>&1 | summary)

echo; echo "### 1. Chrome: bunfig.toml"
bun test 2>&1 | summary

echo; echo "### 2. Firefox: bunfig.firefox.toml, transpiler cache warm from run 1"
bun test --config=bunfig.firefox.toml 2>&1 | summary

echo; echo "### 3. Firefox, transpiler cache off"
BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 bun test --config=bunfig.firefox.toml 2>&1 | summary

echo; echo "### 4. Explicit imports, fake-browser preload only"
bun test --config=bunfig.minimal.toml ./explicit-imports.test.ts 2>&1 | summary

echo; echo "### 5. Auto-imports without the unimport preload"
bun test --config=bunfig.minimal.toml ./parity 2>&1 | summary

echo; echo "### 6. Auto-imports with WXT's unimport config as a runtime plugin"
bun test --config=bunfig.parity.toml ./parity ./storage.test.ts 2>&1 | summary

echo; echo "### 7. mock.module across files: shared registry (default)"
bun test --config=bunfig.isolation.toml ./isolation 2>&1 | summary

echo; echo "### 8. mock.module across files: --isolate"
bun test --config=bunfig.isolation.toml --isolate ./isolation 2>&1 | summary

echo; echo "### 9. Coverage"
bun test --coverage 2>&1 | grep -aE "^-|File|All files|src/lib/(storage|auth)|theme-provider|#imports|setup/"

echo; echo "### 10. Today's unchanged Vitest files (src/, Chrome), shared registry"
(cd "$ROOT" && bun test --config="$SPIKE/bunfig.compat.toml" ./src 2>&1 | grep -aE " pass$| fail$|errors?$|^Ran ")

echo; echo "### 11. Same, --isolate"
(cd "$ROOT" && bun test --config="$SPIKE/bunfig.compat.toml" --isolate ./src 2>&1 | grep -aE "is not a function|is not defined| pass$| fail$|errors?$|^Ran " | sort | uniq -c)

echo; echo "### 12. Probes: plugin hooks, vitest imports, test globals, define, CSS and assets"
bun test --config=bunfig.probes.toml ./probes 2>&1 | summary
