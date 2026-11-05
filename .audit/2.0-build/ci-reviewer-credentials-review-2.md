# G28 secret-flow review, round 2

Verdict: not ready, but close. No leak or likely leak as written. 55 tests pass and 17 of 17 planted breaks are caught. Round 1 findings 1 to 7 are resolved, except that the action pins are owner TODOs and the ruleset is incomplete.

## Hardening

- **H1. Parent-directory tsconfig.json or jsconfig.json runs code beside the login** (`release.yml:230`, `:406`). Bun searches the script's directory and every parent for tsconfig.json/jsconfig.json; `--config=empty.toml` doesn't stop it, and `"paths": {"*": ["./planted.ts"]}` redirects even `node:fs` and `node:crypto` imports. Proven end to end through the real check step: digest passed, step exited 0, planted code read the login. Same for jsconfig one level up and tsconfig two levels up. Fix: write `{}` to `$work/tsconfig.json`, or pass `--tsconfig-override=<a {} file in $work>`; both stopped all three cases. Add `_temp/tsconfig.json` and a workspace-root `jsconfig.json` to the planted-config test, plus a planted-break row.
- **H2. The off-switch tests check only the prefix** (`amo-reviewer-notes.test.ts:252-262`). `toStartWith("false && ")` passes `false && … || vars.G28_ON == 'true'`, which runs the job. Fix: compare the whole `if` to a constant, or reject `||` and status functions in these jobs. Planted-break row.
- **H3. The environment test reads names literally** (`test.ts:236-243`). `environment: ${{ format('amo-{0}', 'reviewer') }}` passes; a job-level `uses: other/repo/.github/workflows/x.yml@ref` whose job declares `amo-reviewer` gets this repo's environment secrets and is never parsed. Fix: fail any `environment` containing `${{`, and any job-level `uses:` outside `./.github/workflows/`.
- **H4. The ruleset doesn't freeze the workflow** (`releasing.md:69`, `:89`). Without last-push approval or dismissing stale approvals, a commit pushed after approval merges without code-owner review, and an agent may merge. Fix: require last-push approval, at least one approval, code-owner review, no bypass actor except the owner and no GitHub App. Add a true/false `gh api` check for this step (from memory: `repos/…/rules/branches/main` with `require_code_owner_review`, `require_last_push_approval`, `dismiss_stale_reviews_on_push`; bypass actors from `repos/…/rulesets/<id>`). Add `and .can_admins_bypass == false` to the first jq at `releasing.md:85`.
- **H5. Code that isn't code-owned can neuter the proof.** CI runs the G28 test from the repo root (`run-bun-tests.ts:35`), loading `bunfig.toml`'s `[test] preload` (four `tests/setup/*.ts`) and `tsconfig.json`, which extends `.wxt/tsconfig.json` written at postinstall. Fix: run the G28 test in its own CI step before `bun install` with an empty `--config` and `--tsconfig-override`; or code-own `bunfig.toml`, `tsconfig.json` and `tests/setup/**`.
- **H6. `mktemp`, `cp` and `shasum` inherit the login and the JWT pair.** Fix: `export -n` them first and `export` just before `exec`.
- **H7. Pins and the Bun binary.** GitHub resolves a fork's commit under the parent's name, so each SHA must come from the upstream tag's peeled commit (`git ls-remote https://github.com/actions/checkout 'refs/tags/v7*'`). Optionally check `vars.BUN_SHA256` against `command -v bun` before `exec`.

## Nits

- N1. Add `SSLKEYLOGFILE` to `UNSAFE` (`amo-reviewer-notes.ts:33`).
- N2. Ban `getBuiltinModule|import\.meta\.require|\bimport\(|\brequire\(` in the import lint (`test.ts:303`).
- N3. On bash 5.3, a name like `A-B` from `compgen -e` makes `unset` stop the step; it fails closed. Fix the design's claim.
- N4. A planted `BASH_FUNC_shasum%%` defeats the digest check; the pins are the boundary. Already a design caveat.
- N5. Add `pipefail` to the `gh variable set` command at `releasing.md:93`.
- N6. Add the planted-break runner, `releasing.md` and the design to CODEOWNERS.
- N7. Unverified without network: a skipped job gets no secrets and no deployment; setup-bun accepts `no-cache`; the step header masks all four lines. Settle with a dry run in a scratch repo with a dummy login.
- N8. Outside G28: `GH_TOKEN` (contents: write) is job-level in `submit-amo`; only the last step uses it.

## Approval covers

The script at its digest; all of `release.yml`; the three actions per reviewer job at owner-pinned upstream SHAs and Bun 1.4.3; the tests and their runner, plus `bunfig.toml`, `tests/setup/*.ts` and `tsconfig.json` unless H5 isolates them; CODEOWNERS with H5 and N6 paths; the `releasing.md` section and the design; settings: the `amo-reviewer` environment (owner as reviewer, main only, admin bypass off and checked), no repository-level `REVIEWER_NOTES_SHA256`, the `main` ruleset (code-owner review, last-push approval, no bypass but the owner), `vars.PUBLISH_AMO`.
