# Qualify the extension-page picker

This fixture uses the actual production picker components and `PickerModel` over deterministic synthetic `PickerSource` implementations. It imports the accepted theme and packaged brand mark. It adds no production entrypoint, permission, dependency, or main configuration change.

No command in this document ran during authoring. A later executor needs the coordinator's sole runtime lease. Compiler, tests, builds, browser, visual parity, and axe remain unexecuted. Authored assertions are not evidence that the renderer works.

## Prepare the qualification root

Install the complete sealed non-environment source into the runtime executor's T3-provided isolated worktree under a recorded integration. Keep all evidence. Do not use HEAD as authority. Use a non-environment qualification root inside that worktree. `qualify.py` rejects an environment-file name at its root without opening its bytes.

`dependency-pins.json` records prepared package metadata and executable identities. The launcher verifies them before it runs anything. The `prepare` gate links the prepared dependency tree without installing it, then generates WXT's local types. It refuses a different existing dependency tree. Package metadata hashes do not attest every dependency byte.

Every gate uses a cleared environment, fresh scratch HOME and TMPDIR, pinned executables, an owned process group, recorded output, and an inner `timeout -k 10` deadline no greater than 540 seconds. Every authored Bun invocation carries both `--no-env-file --no-install`. The adjacent selected tests contain no child process launch. No installer, network dependency fetch, live account, owner session, signer, or native storage operation is part of these fixtures.

These exact commands run from the installed candidate root after the runtime lease is granted. Each outer deadline is 540 seconds. The launcher records and waits for its own children. A timeout is a failed gate and must not be rerun unchanged.

```sh
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py prepare
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py focused
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py native
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py inclusion
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py svelte
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py negative-FakeModel
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py negative-OutcomeReceipt
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py negative-SharedModel
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py negative-RawAccount
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py negative-ManyWithItem
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py negative-Uncontrolled
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py negative-MissingRelease
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py architecture
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py adjacent
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py consumer-1
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py consumer-2
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py chrome
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py firefox
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py built-fixtures
```

`native` runs the whole native TypeScript project with no emit. `inclusion` checks that every existing protected type assertion, the new picker TypeScript files, and the deterministic consumer appear in the native compiler's file list. No protected assertion or compiler exclusion changes.

`svelte` checks actual component props, including the positives in `ApiChecks.svelte`. Each negative first requires the positive check to pass. It then checks exactly one negative Svelte fixture and requires one diagnostic on its intended line. It does not count a loose wildcard Svelte import as a type check. Generated Svelte caches are preserved in the gate evidence instead of reused.

`consumer-1` and `consumer-2` require exact `expected-consumer.jsonl` bytes and agreement with each other. Their output comes from rendered production panels and scripted real-model outcomes. The expectation file was authored, not generated by a successful run.

## Inspect the rendered fixture

These commands inspect all 19 synthetic scenarios at 360, 700, and 1280 pixels in each named engine and theme. The script records layout facts and captures. It exercises a real chooser open, Escape, focus return, and independent reopen. It records browser launch and loopback errors as failures. It never installs a browser.

```sh
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py render-chromium-light
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py render-chromium-dark
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py render-firefox-light
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py render-firefox-dark
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py axe-chromium-light
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py axe-chromium-dark
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py axe-firefox-light
/usr/bin/timeout -k 10 540 /opt/homebrew/Caskroom/miniconda/base/bin/python3 tools/fixtures/picker-ui/qualify.py axe-firefox-dark
```

The prepared dependencies have no `axe-core`. Axe commands therefore report `E_AXE_UNAVAILABLE_NO_INSTALL_AUTHORIZED` until an approved prepared dependency is supplied and its identity is recorded by a separately authorized change. Browser executable availability is unverified. Restricted loopback or unavailable binaries are not passes.

Open the generated captures and compare the relevant panels against ps-12, ps-13, ps-14, and ps-63 in the approved specification. Check all themes, narrow widths, long titles, focus, inline errors, thumbnails, marks, pins, footer visibility, and popover clipping. The source contains no local approved picker capture, so current visual parity has no acceptance evidence. Numeric layout checks and screenshots alone do not establish parity or axe results.

## Check the proposed defect controls

`defect-controls.json` proposes type-correct mutations for optimistic checks, uncontained Escape, repeated activation, ignored creation refusal, and a shared closed model. Each needs positive native and Svelte compilation, the intended behavioral failure, exact restoration, and a final source rehash. None ran during authoring.

The seven public API negatives separately reject a fake model, an assumed success receipt, an injected shared model, a raw account identifier, many mode with an item, uncontrolled opening, and missing disposal ownership.

## Limits

The private first-pick wording, partial-save closure and retry, and close-during-pick policies were settled on 2026-11-01 (R171 to R173). The renderer emits actual typed results and requires the caller to own release. No callback is a persisted default.

The real Backend bridge, first-run single-commit integration, nullable cache stamp adaptation, popup sheets, site popovers, and full AutoAddList remain adjoining work. Native durability, ownership, and exclusion remain waived and unproven. Privacy approval is pending. Production activation is held. This candidate does not qualify or complete 2.0.
