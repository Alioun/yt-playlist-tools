# G28: the reviewer test account in CI

Status: **proposal, not approved.** Both jobs that read the secret start with `if: false && …`, so GitHub skips them. Nothing here has run against a real secret. This version answers both secret-flow reviews, `ci-reviewer-credentials-review-1.md` and `ci-reviewer-credentials-review-2.md`. The last two sections map each finding to its fix.

## Goal

AMO's reviewers need a working Google account to try 2.0 (REL-STORE-21, REL-STORE-24, REL-STORE-25). The full and hotfix reviewer notes end with a test-account line that has four placeholders:

> {email} / {password}, with backup codes {code1}, {code2} for Google's sign-in check.

The owner decided (G28) that CI fills them now, from the secret `AMO_REVIEWER_LOGIN` (REL-CI-46). The value must reach AMO's reviewer notes and nothing else. It must stay out of logs, artifacts, the GitHub release, the sources zip, and the committed notes, and away from any code the owner hasn't approved.

Chrome needs nothing. The dashboard's test instructions (§11) tell the reviewer to use any Google account with a YouTube channel, and no CWS step needs a reviewer account.

## The secret

**Name and place.** `AMO_REVIEWER_LOGIN`, a secret of the `amo-reviewer` environment. REL-STORE-24 and REL-CI-46 name the `amo` environment. The owner approved moving it to an environment of its own, because every job in `amo` (today `submit-amo`) runs `bun install`, `wxt` and `web-ext`.

**Format.** Four lines, in this order, with nothing else:

1. the account's e-mail address, with no whitespace (`x@y.z`);
2. the password, not empty, with no leading or trailing space (Google forbids both);
3. a backup code, 8 digits, written `12345678` or `1234 5678`;
4. a second backup code, different from the first.

One trailing newline is allowed, and so are Windows line endings. Anything else fails the check with a fixed line that names the bad line by number.

Four plain lines beat JSON here. Nothing needs escaping, whatever the password holds, the GitHub form takes a paste, and `op read` prints one value per line.

**Creating it without echoing it.** The owner pastes the four lines into Settings › Environments › amo-reviewer › Add environment secret, or runs the 1Password command in `docs/development/releasing.md`:

```sh
(set -euo pipefail
 login=$(op read "op://<vault>/<item>/username" &&
   op read "op://<vault>/<item>/password" &&
   op read "op://<vault>/<item>/<backup code field 1>" &&
   op read "op://<vault>/<item>/<backup code field 2>")
 printf '%s\n' "$login" | gh secret set AMO_REVIEWER_LOGIN --env amo-reviewer --repo Alioun/yt-playlist-tools) >/dev/null 2>&1 && echo set || echo failed
```

The value travels through a variable and a pipe, never argv, and the command prints `set` or `failed`. The first proposal piped the four reads straight into `gh secret set`. A failed third read then still stored the first two lines, and the group reported only the last read's status. The review suggested chaining the reads with `&&`, which fixes the status but still stores a partial value. Reading into a variable first means `gh` never starts unless all four reads succeed. Under the owner's rules this becomes a wizard stage once approved. This proposal doesn't write that wizard, because a wizard that runs `op read` is secret-handling code of its own.

## The `amo-reviewer` environment

| Setting | Value |
|---|---|
| Required reviewer | the owner, self-review allowed |
| Deployment branches and tags | selected, one rule: the branch `main` |
| Administrators bypass protection rules | off, and checked |
| Secrets | `AMO_REVIEWER_LOGIN`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` (the same pair as `amo`) |
| Variables | `REVIEWER_NOTES_SHA256`, the digest of the approved script; optionally `BUN_SHA256`, the digest of the Bun binary |
| Jobs that use it | `check-reviewer-login` and `fill-reviewer-notes` in `release.yml`, and no other (tested) |

"Main only" is the boundary that stops another branch's copy of `release.yml` from reaching the secret, since a workflow on another branch can drop any check written in the workflow itself. So it is a precondition the owner checks before storing anything. `releasing.md` gives three `gh api` commands. They print `true` only when `main` alone may deploy, the owner is the required reviewer, administrators can't bypass, and no repository variable stands in for a digest. None prints anything secret.

**The digest lives in the environment.** `vars.REVIEWER_NOTES_SHA256` is an environment variable only the owner can set. The workflows hold no digest, and a test fails if one appears. Whoever edits the script can no longer move the pin in the same pull request. The owner computes the digest from the approved commit (`git show <commit>:scripts/amo-reviewer-notes.ts | shasum -a 256`). `vars.` falls back to a repository variable of the same name when the environment has none, so the setup checks that no repository variable is called `REVIEWER_NOTES_SHA256` or `BUN_SHA256`.

**Code owners.** `.github/CODEOWNERS` names the owner for itself, `.github/workflows/**`, the script, its tests and fixture, the planted-break runner, this design, `docs/development/releasing.md`, `package.json` and `bun.lock`. A test resolves every file the approval covers through CODEOWNERS, with the last matching line winning as on GitHub, and expects the owner.

**The `main` ruleset.** Code owners count only once the ruleset requires their review, and only if a later push can't slip past that review. The ruleset needs at least one approval, review from Code Owners, approval of the most recent reviewable push, and stale approvals dismissed on push. Its bypass list holds the Repository admin role, which in a personal repository is the owner alone, or nothing. Without last-push approval, a commit pushed after the owner approved would merge without the owner's review, and an agent could merge it. `releasing.md` setup step 3 sets the ruleset up and gives `true`/`false` checks for it. Tests run each check against fixture API answers.

## The two jobs

`check-reviewer-login` needs `meta` and `build`, and runs for a push to `main` that releases a stable version with `PUBLISH_AMO` set. `submit-amo` needs it and runs only when it succeeded or was skipped, never after it failed. `fill-reviewer-notes` needs a successful check and a successful `submit-amo`. Betas skip both jobs, so a beta release neither hands the login to a runner nor asks for extra approvals. Their notes carry no placeholders, and the script would print `skipped` for them anyway.

Each job has four steps and nothing else:

1. `actions/checkout`, sparse, with only `/scripts/amo-reviewer-notes.ts` and `persist-credentials: false`. No `package.json`, lockfile, `bunfig.toml` or `tsconfig.json` reaches the runner.
2. `oven-sh/setup-bun` with `bun-version: 1.4.3` (a test holds it to `package.json`'s `packageManager`) and `no-cache: true`, so no cache entry another job saved can replace the binary.
3. `actions/download-artifact`, for the build's `dist/amo-metadata.json`.
4. The step that reads the login. Its `run:` block:
   - copies the paths and the two digests it needs into shell variables;
   - unsets every exported name except `PATH`, and un-exports the login (and, for the fill, `FIREFOX_EXTENSION_ID` and the JWT pair), so no tool the block runs before Bun inherits them;
   - refuses unless `vars.REVIEWER_NOTES_SHA256` is a SHA-256 digest, and unless `vars.BUN_SHA256` is empty or one;
   - looks up `bun` on `PATH` once;
   - makes a fresh directory with `mktemp -d "$RUNNER_TEMP/reviewer-notes.XXXXXX"`, copies the script into it with an empty `empty.toml` and an `empty.json` holding `{}`, and checks the copy's digest;
   - when `vars.BUN_SHA256` is set, checks the `bun` it found against it;
   - exports the kept names and `HOME`, set to that directory, and runs `exec "$bun" --no-env-file --config=empty.toml --tsconfig-override=empty.json amo-reviewer-notes.ts check|fill …`.

Each action is still on its tag. **The owner pins each to a commit SHA before turning the jobs on.** This session had no network, and nothing on this machine records which commit `actions/checkout@v7`, `oven-sh/setup-bun@v2` or `actions/download-artifact@v8` resolves to. GitHub resolves a fork's commit under the parent repository's name, so a SHA copied from a fork or a pull request would run the fork's code under the upstream name. The owner takes each SHA from the upstream repository's newest exact release tag. For an annotated tag, the commit is the line ending in `^{}`:

```sh
git ls-remote https://github.com/actions/checkout 'refs/tags/v7*'
git ls-remote https://github.com/oven-sh/setup-bun 'refs/tags/v2*'
git ls-remote https://github.com/actions/download-artifact 'refs/tags/v8*'
```

Each `uses:` line carries `# TODO(owner, G28)`, and a test fails if a job is turned on while any of its actions isn't pinned to a 40-character SHA.

### Step by step, and where the value is at each step

| # | Where | What holds the value | For how long |
|---|---|---|---|
| 1 | GitHub's encrypted secret store, `amo-reviewer` environment | the secret | until the owner replaces or deletes it |
| 2 | `check-reviewer-login` starts once the owner approves the `amo-reviewer` deployment, and only from `main`. GitHub hands the job's secrets to an ephemeral runner, which registers each with its log masker. | the runner process | the job |
| 3 | The three pinned actions | They run in a job that holds the secrets, so they are code the approval covers. None receives the login as an input. | each action's run |
| 4 | "Check the reviewer test account" | the step's `env`, then its `bash`, which strips every other name and keeps the login from `mktemp`, `cp` and `shasum` until `exec` | about a second |
| 5 | `bun amo-reviewer-notes.ts check` | the parsed login in memory | until that process exits |
| 6 | `submit-amo`, in the `amo` environment | nothing. It has no access to `amo-reviewer`, so its `bun install`, `wxt submit`, `web-ext sign` and `amo-version.ts` never get the login | |
| 7 | `fill-reviewer-notes`, after a second approval of `amo-reviewer` | as in rows 2 to 4, with the JWT pair and the GUID kept as well | one to three seconds |
| 8 | `bun amo-reviewer-notes.ts fill` | the login and the filled notes in memory, then the TLS request body to `addons.mozilla.org`. A redirect fails instead of being followed, and the request gives up after 30 seconds | until that process exits |
| 9 | AMO | the version's `approval_notes`, which AMO shows to its reviewers and the add-on's authors | until replaced, and possibly longer: AMO likely keeps earlier notes in the version's review history (unverified) |

The version reaches AMO with the placeholders first, because `wxt submit` uploads the build's `dist/amo-metadata.json`. The fill follows once `submit-amo` has confirmed the version and its sources. If the fill fails, the version shows the placeholders until **Re-run failed jobs**, which runs the fill again. The PATCH is idempotent.

## What runs beside the login

Only these, and each is part of the approval:

- **The three actions,** each at the commit the owner pins.
- **The step's `bash`.** It reads `BASH_ENV` and imports exported functions before the `run:` block starts, so the block can't strip those. Only the three actions run before it in the job, and they could set them through `GITHUB_ENV`. An exported function named `shasum` (`BASH_FUNC_shasum%%` in `GITHUB_ENV`) would replace both digest checks with checks that always pass, and `command`, `builtin` and `exec` can be replaced the same way. The pins are the defence here, not the digest checks (second review, N4).
- **`mktemp`, `cp` and `shasum`,** from the runner image. None inherits the login or the JWT pair, which stay un-exported until the line before `exec`. A test puts stubs on `PATH` that record what each one can see.
- **Bun 1.4.3,** as setup-bun downloads it. Its environment is the allowlist above. It starts from a fresh directory with an empty config and an empty tsconfig. On Bun 1.4.3, `--config=<empty file>` stopped a `bunfig.toml` in the working directory from preloading, and `BUN_OPTIONS="--preload …"` still preloaded through it. The allowlist removes `BUN_OPTIONS`. `--config` doesn't stop Bun from reading the nearest `tsconfig.json` or `jsconfig.json` above the script, and its `paths` can send even `node:fs` to planted code. `--tsconfig-override=empty.json` stopped that in each of the four places the tests plant one. When the owner sets `vars.BUN_SHA256`, the step runs Bun only at that digest. Without it, nothing checks setup-bun's download.
- **The script.** It refuses to run when any `BUN_*`, `NODE_*` or `SSL_CERT_*` variable, `SSLKEYLOGFILE`, or `http_proxy`, `https_proxy` or `all_proxy` (any case) is set. That covers names the allowlist can't remove.

An environment entry whose name isn't a shell identifier, such as `BUN_CONFIG_VERBOSE-FETCH`, behaves differently by bash version. Measured here with dummy values, bash 3.2.57 lists it in `compgen -e`, its `unset` fails, and `-e` stops the step before Bun starts. Homebrew's bash 5.3.20 leaves it out of `compgen -e`, so it reaches Bun, and the script refuses it by its prefix. The second review saw a bash 5.3 stop the step. The bash 5.2 on `ubuntu-latest` is unprobed. For a `BUN_` or `NODE_` name the step fails closed on every bash, and a test holds that on whichever bash runs it. A name with any other prefix reaches Bun on a bash that passes it through. Bun reads its settings only from names that are shell identifiers (inferred from its documented variables, not probed).

## How the value gets to AMO

`scripts/amo-reviewer-notes.ts` is the only code that reads the value. It imports only `node:crypto` and `node:fs`, writes no file, spawns nothing, and prints exactly one fixed line per run. It has two commands.

- `check <metadata file>` reads the build's `amo-metadata.json`. If its `approval_notes` has no placeholders (the beta template) it prints `skipped` and never reads the secret. If it has all four, it parses `AMO_REVIEWER_LOGIN` and prints `ready`. No network.
- `fill <version> <metadata file>` does the same checks, fills the four placeholders in one pass, and sends one `PATCH /api/v5/addons/addon/<GUID>/versions/v<version>/` with `{"approval_notes": <filled notes>}` and a JWT, with `redirect: "error"` and a 30-second `AbortSignal.timeout`. It then compares AMO's answer with what it sent.

The one-pass fill matters. A password containing `{code1}` or `$&` goes in literally, and a test proves it.

Probes on Bun 1.4.3 with dummy values, against a local server, showed why the two fetch options are there. A cross-origin 308 with the default `redirect: "follow"` re-sent the PATCH body to the second host, and `redirect: "error"` made the fetch throw instead. `BUN_CONFIG_VERBOSE_FETCH=curl` printed the whole request, body included, to stderr. A self-signed certificate failed the request unless `NODE_TLS_REJECT_UNAUTHORIZED=0` or `NODE_EXTRA_CA_CERTS` was set.

## Why not hand the filled file to `wxt submit`

The brief expected the filled notes to go through `scripts/amo-metadata.ts` and `wxt submit`. That design lost for three reasons.

- **`wxt submit` prints AMO's raw error body.** publish-browser-extension 6.1.1 (the locked version) throws `Fetch request failed with code ${res.status} ${res.statusText}: ${await res.text()}` on any non-2xx answer (`dist/init-DhMr270n.mjs:104`). No one can prove AMO never quotes a rejected field back, so a failed upload could print the password.
- **It needs a file.** The filled notes would sit on the runner's disk while third-party code reads them. With the PATCH they exist only in one process's memory.
- **`amo-metadata.ts` runs in the `build` job,** which must never get the secret. Its output goes into the `release-<version>` artifact.

The cost is the window between the submit and the fill, and a second copy of the 6-line JWT helper from `scripts/amo-version.ts`. The copy keeps the approved code to one file that imports nothing from the checkout.

## How each output stays free of the value

- **Logs.** The script prints one line built from constants, line numbers, counts, the version, placeholder names and an HTTP status. The `run:` blocks name `AMO_REVIEWER_LOGIN` only in the allowlist and the `export` before `exec`, and never expand it. The tests run both real `run:` blocks under `bash -x` and find no form of any part of the login in stdout or in the trace. The runner's masking stays a backstop and is not the boundary. It masks one encoding at a time, so a value escaped twice would get through it.
- **Argv and environment of every spawned process.** The value arrives through the step's env only. The `bash -x` trace shows the expanded argv of every command the step spawns (`mktemp`, `cp`, `shasum`, `bun`), and none holds any part. Only `bun` gets the login in its environment. The script has no way to spawn. Bun's own import scanner lists `node:crypto` and `node:fs` as its only imports, which catches side-effect imports, `export … from`, and `require` and `import()` with a literal name. The scanner misses a name computed at run time, so the import test also bans `getBuiltinModule`, `import.meta.require`, `require(` and `import(`.
- **Artifacts.** The only artifact, `release-<version>`, comes from the `build` job. A test runs the real `amo-metadata.ts` with `AMO_REVIEWER_LOGIN` set and finds only the placeholders in the file it writes. Neither reviewer job uploads anything.
- **The GitHub release, the sources zip and the committed notes.** The jobs that make them can't use `amo-reviewer`. `store/notes/reviewer-*.md` hold only placeholders, and no job writes back to the repository.
- **The uploaded metadata.** `wxt submit` and `web-ext sign` upload `dist/amo-metadata.json` with the placeholders. A test checks that it is byte-identical after the fill.
- **Files on the runner.** The script writes none. The launcher's directory under `$RUNNER_TEMP` holds the script copy, the two empty configs, and whatever Bun caches under `HOME` (on macOS, `Library/`). GitHub empties `$RUNNER_TEMP` after each job. The end-to-end test scans every file left in the workspace, that directory included.

## Failure paths

Every line goes to stdout, where GitHub turns `::error::` into an annotation. None quotes the login, the notes, AMO's answer or an exception message.

| Situation | Job | Prints | Exit | State on AMO | The owner then |
|---|---|---|---|---|---|
| The notes ask for no account | both | `reviewer-notes: skipped (the notes have no test-account placeholders)` | 0 | unchanged | nothing |
| All good | check | `reviewer-notes: ready` | 0 | nothing submitted yet | nothing |
| All good, AMO echoes the notes | fill | `reviewer-notes: filled (AMO version 2.0.0, confirmed)` | 0 | filled | nothing |
| All good, AMO's answer omits the notes | fill | `reviewer-notes: filled (AMO version 2.0.0; its answer does not show the notes)` | 0 | filled, unconfirmed | checks the Developer Hub once |
| `vars.REVIEWER_NOTES_SHA256` unset or not a digest | both | `::error::vars.REVIEWER_NOTES_SHA256 is not a SHA-256 digest (G28)` | 1 | nothing submitted if at check | sets it from the approved commit |
| `vars.BUN_SHA256` set but not a digest | both | `::error::vars.BUN_SHA256 is not a SHA-256 digest (G28)` | 1 | nothing submitted if at check | fixes or deletes the variable |
| Script differs from the digest | both | `::error::amo-reviewer-notes.ts is not the approved version (G28)` | 1 | nothing submitted if at check | re-approves, then updates the variable |
| Bun differs from `vars.BUN_SHA256` | both | `::error::bun is not the approved build (G28)` | 1 | nothing submitted if at check | finds which build setup-bun installed, then updates the variable or the pin |
| A `BUN_*`, `NODE_*`, `SSL_CERT_*`, `SSLKEYLOGFILE` or proxy variable reaches the script | both | `::error::reviewer-notes: environment-unsafe (a BUN_, NODE_, SSL_CERT_, SSLKEYLOGFILE or proxy variable is set)` | 1 | nothing submitted if at check | finds what set it; the allowlist should have removed it |
| A `BUN_` or `NODE_` name that isn't a shell identifier | both | the line above, or on a bash that lists it, bash's own `not a valid identifier` with the name | 1 | nothing submitted if at check | finds what set it |
| Secret not set or empty | check | `::error::reviewer-notes: login-missing (AMO_REVIEWER_LOGIN is not set)` | 1 | nothing submitted | sets it, then Re-run failed jobs |
| Wrong number of lines | check | `::error::reviewer-notes: login-malformed (expected 4 lines, got N)` | 1 | nothing submitted | fixes it, re-runs |
| Bad line | check | `login-malformed (line 1 is not an e-mail address)`, `(line 2 is empty or padded)`, `(line 3 is not an 8-digit backup code)`, `(line 4 is not an 8-digit backup code)` or `(lines 3 and 4 are the same code)`, each after `::error::reviewer-notes: ` | 1 | nothing submitted | fixes it, re-runs |
| Template has some placeholders, not all | check | `::error::reviewer-notes: template-incomplete (the notes lack {code1}, {code2})` | 1 | nothing submitted | fixes `store/notes/`, which needs a new release commit |
| Metadata missing, not JSON, or notes not text | check | `::error::reviewer-notes: notes-unreadable (the metadata file is missing, not JSON, or its approval_notes is not text)` | 1 | nothing submitted | looks at the build job |
| AMO keys missing | fill | `::error::reviewer-notes: amo-keys-missing (FIREFOX_EXTENSION_ID, FIREFOX_JWT_ISSUER and FIREFOX_JWT_SECRET must be set)` | 1 | placeholders | stores the JWT pair in `amo-reviewer` |
| AMO answers non-2xx | fill | `::error::reviewer-notes: upload-failed (AMO answered 400)` (the status only) | 1 | placeholders | Re-run failed jobs |
| No answer, a dropped connection, a TLS failure, 30 seconds without an answer, or a redirect | fill | `::error::reviewer-notes: upload-failed (no answer from AMO within 30 seconds, or a redirect)` | 1 | placeholders | Re-run failed jobs |
| AMO answers with different notes | fill | `::error::reviewer-notes: upload-unconfirmed (AMO kept different notes)` | 1 | unknown | checks the Developer Hub |
| Anything unexpected | both | `::error::reviewer-notes: internal-error` | 1 | placeholders at worst | reproduces locally with dummy values |
| Bad arguments | both | `usage: …` on stderr | 2 | nothing | fixes the workflow |

The `internal-error` catch-all stays, but no test reaches it any more. The first proposal reached it through a replaced `fetch` whose answer threw. A real server can't produce that answer, and the script handles every answer a real server can give.

## Tests (credential-free)

`tests/integration/amo-reviewer-notes.test.ts`, 75 tests, all passing. CI runs them in a step of its own in `ci.yml`'s `build` job, after checkout and setup-bun and before `bun install`:

```sh
bun --config="$RUNNER_TEMP/empty.toml" test --no-env-file --tsconfig-override="$RUNNER_TEMP/empty.json" ./tests/integration/amo-reviewer-notes.test.ts
```

The repository's `bunfig.toml` preloads four `tests/setup/*.ts` files, and `tsconfig.json` extends `.wxt/tsconfig.json`, which `bun install` writes. None of them is code-owned, and through the full suite each could neuter the proof. A planted `tsconfig.json` whose `paths` maps `*` to its own file made `bun test` register no test in the file and still exit 0. Each override alone still let the other file through, and both together stopped both. Before the install, with both overrides, only code-owned files decide the result. The full suite still runs the file a second time, with the preloads. That run proves nothing extra and isn't part of the approval.

At the first proposal's base commit the file had 33 tests and one failed: it ran `amo-metadata.ts --strict` on a stable build and expected success, but `--strict` fails on the four test-account placeholders. The test now builds without `--strict` and says why.

- Every value is a fake. The password is `dummy-reviewer-password-0000"\$&{code1}`, the codes are `0000 1111` and `2222 3333`, and the JWT pair is `dummy-jwt-issuer-0000` and `dummy-jwt-secret-0000`. Each child process gets an environment built from scratch. Dummies go through env, never argv, and no test name holds a value. A failing leak check names the leaked field, never its value.
- **The leak check** looks for each value raw, JSON-escaped once and twice, URL-encoded (with `%20` or `+`), in base64 and base64url at all three byte offsets, and each of those again with spaces removed, so `00001111` counts as the first code. A test feeds it each value in each of those forms, built independently, and expects it found.
- **Real fetch.** `tests/integration/fixtures/fake-amo.ts` is a local HTTP or HTTPS server, and the script's own `fetch` reaches it over a socket. The only change to the script under test is the API origin, and, for one test, the timeout. Each is a string swap that a test checks matched exactly once. The server answers in eight ways: store, store without echoing, a cut-off body, other notes, a 400 quoting the notes, a dropped connection, no answer, and a 308 to a second server that records what reaches it.
- **The real `run:` blocks.** The step tests take both blocks from `release.yml`, map each step's `env:` expressions to dummies, and run them under GitHub's `bash --noprofile --norc -eo pipefail`, plus `-x`, in a temporary runner workspace. `vars.BUN_SHA256` is empty unless a test sets it to the running Bun's digest, to another digest, or to a non-digest.
- **A tampered runner.** The fill step runs with `BUN_CONFIG_VERBOSE_FETCH=curl`, with `BUN_OPTIONS="--preload <planted file>"`, with a `bunfig.toml` that preloads planted in the workspace, `scripts/`, `RUNNER_TEMP` and `HOME`, with a `tsconfig.json` or `jsconfig.json` mapping every import to planted code one and two levels above the script, with `NODE_TLS_REJECT_UNAUTHORIZED=0` or `NODE_EXTRA_CA_CERTS` against an HTTPS fake whose certificate nothing trusts, and with a `BUN_` name that isn't a shell identifier. Nothing leaks, the planted code never runs, and the untrusted server never gets a request. Stubs for `mktemp`, `cp` and `shasum` record that none of them sees the login or the AMO keys. The script alone refuses each of eight unsafe variables before AMO hears anything.
- **The workflows.** Every workflow reads secrets and the job token only by name: `secrets['…']`, `toJSON(secrets)`, a `secrets:` key, and `github` whole (as in `toJSON(github)`) fail. No workflow- or job-level `env` holds a secret or `github.token`. `AMO_REVIEWER_LOGIN` appears in exactly the two reviewer steps. Every environment name is literal, every job-level `uses:` calls a workflow under `./.github/workflows/`, and only the two reviewer jobs use `amo-reviewer`. Both stay off, compared whole against their expected condition, can't turn on while an action is unpinned, check out only the script without credentials, run nothing but the three actions and their step, and install the declared Bun without a cache. `submit-amo` waits for the check, and the fill waits for both. The workflows hold no digest.
- **The CI step.** It comes before `bun install`. A test runs its real `run:` block against a stand-in test file, beside a `bunfig.toml` that preloads and a `tsconfig.json` that redirects `node:fs`. The stand-in passes, and neither planted file takes effect.
- **CODEOWNERS.** Every file the approval covers exists and resolves to the owner.
- **The owner's commands in `releasing.md`.** Each `--jq` filter runs through `jq` against fixture API answers. It prints `true` for the settings the setup asks for, and `false` when any one is weakened or missing: administrator bypass, another reviewer, protected-branch deployment, a repository-level digest, each pull-request rule parameter, a GitHub App, deploy key or lesser role in the bypass list, a hidden bypass list, and evaluate-only enforcement. The digest command runs in a scratch git repository with a stub `gh` as the only `gh` on `PATH`. It passes the approved script's digest to `gh`, and with a missing commit it fails without calling `gh`.

**Each test was shown to catch a break.** `.audit/2.0-build/ci-reviewer-credentials-mutations.sh` copies the G28 files to a scratch directory, plants one break, runs the tests as the CI step does, and expects named tests to fail. Naming rows after the base commit runs only those. All 45 are caught:

| Row | Break | Tests that fail |
|---|---|---|
| old-script | the script as it was at `14365d0d7` | 14: the 8 refusals, the redirect, the hang, the dropped connection, the 2 certificate tests and the non-identifier name |
| follows-redirects | `redirect: "error"` removed | the redirect test |
| no-timeout | the timeout disabled | the hang test |
| no-refusal | the environment check removed | 9: the 8 refusals and the non-identifier name |
| logs-tls-keys | `SSLKEYLOGFILE` dropped from the refusal | its refusal test |
| no-refusal-odd-name | the environment check removed, on a bash that passes the name to Bun | the non-identifier name test (9 in all) |
| side-effect-import | `import "node:vm"` added | the import test |
| re-export | `export * from "node:os"` added | the import test |
| builtin-module | `process.getBuiltinModule` with a computed name | the import test, which missed it before |
| meta-require | `import.meta.require` with a computed name | the import test, which missed it before |
| computed-require | `require` with a computed name | the import test, which missed it before |
| computed-import | `import()` with a computed name | the import test, which missed it before |
| keeps-environment | the allowlist loop removed | 37, including the 4 strip tests and the stub test |
| exports-early | the loop keeps the login exported | the stub test |
| runs-in-runner-temp | the launcher in `RUNNER_TEMP` without the empty config | 4, including the planted `bunfig.toml` |
| reads-parent-tsconfig | `--tsconfig-override` removed | 6: the 4 planted-config tests and 2 trace checks |
| unchecked-bun | the Bun check removed | the 2 Bun-mismatch tests |
| bun-digest-unchecked-format | the `vars.BUN_SHA256` format check removed | its format test |
| bun-digest-wrong-file | the Bun check hashing the script instead | the matching-Bun test |
| gate-open | the check job's `false && ` removed | the gate and pin tests |
| check-gate-widened | `\|\| vars.G28_ON == 'true'` after the check job's condition | the gate and pin tests, which passed it before |
| fill-gate-widened | `\|\| always()` after the fill job's condition | the gate and pin tests, which passed it before |
| digest-in-repo | a digest written into the workflow | 21 |
| no-digest-check | the digest-format check removed | 2 |
| shared-environment | `submit-amo` moved into `amo-reviewer` | the environment test |
| computed-environment | a job with `environment: ${{ format('amo-{0}', 'reviewer') }}` | the literal-name test alone |
| foreign-workflow | a job calling another repository's workflow | the literal-name test alone |
| bulk-secrets | `toJSON(secrets)` in `ci.yml` | the reference test |
| indexed-secret | `secrets['AMO_REVIEWER_LOGIN']` in `ci.yml` | the reference test |
| bulk-github | `toJSON(github)` in `ci.yml` | the reference test |
| job-level-token | `GH_TOKEN` back in `submit-amo`'s job env | the job-level env test |
| ci-reads-bunfig | the CI step without `--config` | the CI isolation test |
| ci-reads-tsconfig | the CI step without `--tsconfig-override` | the CI isolation test |
| ci-after-install | the CI step after `bun install` | the CI order test |
| runner-unowned | the runner's CODEOWNERS line removed | the CODEOWNERS test |
| docs-unowned-later | a later CODEOWNERS line with no owner for `releasing.md` | the CODEOWNERS test |
| env-admin-bypass | the environment check without `can_admins_bypass` | the environment-check test |
| repo-digest-allowed | the repository-variable check without `BUN_SHA256` | the repository-variable test |
| ruleset-no-last-push | the ruleset check without last-push approval | the ruleset test |
| ruleset-any-bypass | the bypass check without its actor test | the bypass test |
| digest-without-pipefail | the digest command under `set -eu` | the digest-command test |
| digest-round-1 | `releasing.md` as at `4684a5621` | 5, including the digest-command test |
| old-runner | the fill step's old launcher with the old script | 24, including all 10 tampered-runner tests |
| job-level-keys | `ci.yml` as at `14365d0d7`, with the JWT pair in job env | 3, including the job-level env test |
| old-leak-check | the old two-form leak check | the leak-check test |

The full run took 6 minutes 38 seconds on this machine, with Homebrew's bash 5.3.20 first on `PATH`.

## Unverified, to settle when turning it on

- **AMO accepts `approval_notes` on the version edit endpoint.** This comes from AMO's v5 API docs as I recall them; this session had no network. The endpoint and its JWT already work for `source` and `compatibility`. After the first approved release, the owner looks once at the version's "Notes to Reviewer" in the Developer Hub.
- **Whether AMO's answer includes `approval_notes`,** and whether AMO keeps earlier notes in the version's review history. The script handles both answers. If AMO keeps a history, replacing the notes won't erase the login, and the owner rotates the backup codes after each review anyway (REL-CHK-24).
- **A job skipped by its `if` gets no secrets and no deployment.** As I understand GitHub Actions, a skipped job is never sent to a runner. So storing the secret before turning the jobs on is safe, unlike the first proposal's step-level `if: false`. The dry run below settles it.
- **The runner gets every secret of the job's environment,** not only the ones the job names. The design assumes it does, which is why the check job holds the JWT pair too.
- **setup-bun's input is called `no-cache`.** From memory of its `action.yml`. An unknown input is only a warning, and the cache would then stay on. The dry run settles it.
- **The step header masks all four lines of the login.** The first review read `actions/runner` as masking the whole value and each trimmed line. Nobody has seen the header for a four-line secret. The dry run settles it.
- **Which build setup-bun installs on `ubuntu-latest`.** From memory, `bun-linux-x64` on a CPU with AVX2 and the `-baseline` build otherwise. A `vars.BUN_SHA256` for the wrong build fails closed.
- **The field names in the `gh api` checks.** `can_admins_bypass`, `deployment_branch_policy`, `protection_rules[].reviewers[].reviewer.login`, `branch_policies[].type`, the repository variables' `variables[].name`, the branch rules' `type`, `ruleset_id` and `parameters` (`required_approving_review_count`, `dismiss_stale_reviews_on_push`, `require_code_owner_review`, `require_last_push_approval`), and the ruleset's `enforcement` and `bypass_actors[]` (`actor_type`, `actor_id`). All from memory of the REST docs. A wrong name makes a check print `false` or fail, never print `true`. The Repository admin role's ID, 5, is from memory too, and it is the one exception: if 5 named a lesser role, the check would accept that role. So the owner also confirms on the ruleset page that its only bypass entry reads Repository admin.

### The owner's dry run

Three of these need GitHub itself (second review, N7). A dry run in a scratch repository with a dummy login settles them before the real secret exists.

1. Create a private scratch repository with an `amo-reviewer` environment set up as `releasing.md` describes. Store a made-up `AMO_REVIEWER_LOGIN` in it, such as `dummy@example.invalid`, `dummy-password-0000`, `0000 1111` and `2222 3333`, and set `REVIEWER_NOTES_SHA256` for the script at the commit under test.
2. Copy `check-reviewer-login`, with the pins, into a workflow there whose first job uploads a `release-<version>` artifact with an `amo-metadata.json` holding the full template.
3. Run it with `if: false && …`. The job shows as skipped, no deployment to `amo-reviewer` appears in the repository's deployments, and no approval is requested.
4. Remove `false && ` and run it again. The setup-bun step logs no `Unexpected input(s) 'no-cache'` warning.
5. In that run's log, the step's env header shows `AMO_REVIEWER_LOGIN: ***` and nothing of the four lines, and the job prints `reviewer-notes: ready`.
6. Delete the scratch repository.

## Findings outside this change

- **A stable release can't build today.** `amo-metadata.ts --strict` reports `{email}`, `{password}`, `{code1}` and `{code2}` as unfilled and exits 1, so the `build` job fails before any of this runs. Turning G28 on needs `amo-metadata.ts` to let those four through a release build. That file never sees the value and isn't in this change.
- `scripts/amo-version.ts` prints AMO's raw body when a request fails. It no longer runs in a job that holds the login. AMO's answer to its `status` lookup after a fill may contain the filled notes, but on success it prints only `missing`, `no-source` or `present`.
- The test suite as a whole ran past a 9-minute deadline on this machine, with an unrelated timeout in `src/background/store/claim-notice.bun-test.ts`. The reviewer-notes file passes alone, as the CI step runs it, and with the full suite's flags and preloads.
- The fixture's untrusted certificate comes from whichever `openssl` is first on `PATH`. macOS's LibreSSL in `/usr/bin` writes an EC key that Bun can't load (`DECODE_ERROR`), so the two certificate tests fail where `/usr/bin` comes before Homebrew. Homebrew's OpenSSL works, and `ubuntu-latest` ships OpenSSL 3 (not run here).

## What the owner approves

The owner's rules require three things before this runs: these credential-free behavior tests, a separate agent review of the secret flow, and the owner's approval. The tests are done and pass. The second review ran and its findings are fixed here. A third review of this round has not run. The approval covers the files below at one commit, and a change to any of them needs all three again.

1. `scripts/amo-reviewer-notes.ts`, whose digest at that commit goes into `vars.REVIEWER_NOTES_SHA256`. It is the only code that reads the value.
2. `.github/workflows/release.yml` as a whole. It decides which jobs use `amo-reviewer`, in what order they run, that a failed check stops `submit-amo`, and what the reviewer steps run.
3. In each reviewer job, the three actions at the upstream commits the owner pins, and Bun 1.4.3 as `oven-sh/setup-bun` installs it, at `vars.BUN_SHA256` if the owner sets it.
4. The proof and what runs it: `tests/integration/amo-reviewer-notes.test.ts`, `tests/integration/fixtures/fake-amo.ts`, the step "Test the reviewer-login secret flow (G28)" in `.github/workflows/ci.yml` with the checkout and setup-bun before it, `package.json`'s `packageManager` (the Bun that runs the proof), and `.audit/2.0-build/ci-reviewer-credentials-mutations.sh`.
5. `.github/CODEOWNERS`.
6. `docs/development/releasing.md`: the "reviewer test account" section and the `main` ruleset line, which are the owner's procedure for the environment, the ruleset and the secret.
7. This design.
8. Settings, which are not files. The `amo-reviewer` environment: the owner as required reviewer, `main` only, administrator bypass off and checked, its three secrets, `REVIEWER_NOTES_SHA256`, and `BUN_SHA256` if set. No repository-level `REVIEWER_NOTES_SHA256` or `BUN_SHA256`, checked. The `main` ruleset: one approval, review from Code Owners, last-push approval, stale approvals dismissed, no bypass but Repository admin, checked. And `vars.PUBLISH_AMO`.

`bunfig.toml`, `tests/setup/*.ts`, `tsconfig.json`, `scripts/run-bun-tests.ts`, `package.json`'s test scripts and `ci.yml`'s Test step are off the list. The proof step runs before the install, with an empty config and tsconfig, and names the test file itself. The checkout and setup-bun before it are on their tags, like every action in `ci.yml`. A moved tag there could fake the proof, so the owner may pin those two as well.

The first proposal's list also had `package.json`'s dependencies, `bun.lock`, `amo-version.ts` and `check-signed-build.sh`, because they ran in `submit-amo` beside the login. They no longer share a job with it. `scripts/amo-metadata.ts` and the `store/notes/` templates write the notes the fill sends. A changed template can change what AMO receives, but not where the request goes. The owner may add them to the list.

## Turning it on, after approval

1. The owner pins the three actions in both reviewer jobs to commits from the upstream tags, as "The two jobs" describes, replacing each `# TODO(owner, G28)`.
2. The owner runs the dry run in a scratch repository, with the pins from step 1.
3. `amo-metadata.ts` lets the four test-account placeholders through a release build, in its own change.
4. The owner sets up `amo-reviewer` and the `main` ruleset as `releasing.md` describes, in order, and stores nothing until every check prints `true`. Storing the secret before step 5 is safe, because GitHub skips the jobs.
5. A commit deletes `false && ` from both jobs' `if` and changes the test "stay off until the owner approves G28" to expect each condition without it. The pin test then requires the SHAs from step 1. The owner reviews and merges it like any other change to `main`.
6. After the first release that uses it, the owner checks the version's "Notes to Reviewer" on AMO once.

## How the first review's findings were addressed

| # | Finding | Change | Evidence |
|---|---|---|---|
| 1 | The secret steps share `submit-amo` with third-party code | Two jobs of their own in the `amo-reviewer` environment, gated at job level. Sparse checkout of the script with no persisted credentials, no install, a fresh `mktemp -d` under `RUNNER_TEMP`. Actions pinned by the owner (TODO) | workflow tests; the gate, pin and environment plants |
| 2 | Bun's environment prints the notes | An allowlist before `exec bun`, an empty `--config`, and the script refuses unsafe variables | the tampered-runner tests and the refusal tests; the allowlist, old-runner and old-script plants |
| 3 | The request follows redirects | `redirect: "error"` and a 30-second timeout | redirect and hang tests against a real server |
| 4 | The pin isn't a frozen copy | `vars.REVIEWER_NOTES_SHA256` in the environment, CODEOWNERS, a checked main-only precondition | digest tests and plants; `releasing.md` setup steps 2 to 4 |
| 5 | `FIREFOX_JWT_*` in job-level env | Moved to the steps that call AMO in `ci.yml`'s `sign-firefox` and `release.yml`'s `submit-amo` | the job-level env test and plant |
| 6 | Test gaps | Stronger leak check, real fetch, hostile environments, a planted `bunfig.toml`, Bun's import scanner, a secret scan of every workflow | the leak-check test and its plant; the import and secret-reference plants |
| 7 | Nits | The 1Password command reads into a variable first; the setup list is whole again; the value table is rewritten; AMO's review history is noted | this document and `releasing.md` |

## How the second review's findings were addressed

| # | Finding | Change | Evidence |
|---|---|---|---|
| H1 | A parent `tsconfig.json` or `jsconfig.json` runs code beside the login | `--tsconfig-override=empty.json` in both launchers | 4 planted-config tests; `reads-parent-tsconfig` |
| H2 | The off-switch tests check only the prefix | Both tests compare each job's whole `if` with its expected condition | `check-gate-widened`, `fill-gate-widened` |
| H3 | The environment test reads names literally | A test fails any environment holding `${{` and any job-level `uses:` outside `./.github/workflows/` | `computed-environment`, `foreign-workflow`, in which only the new test fails |
| H4 | The ruleset doesn't freeze the workflow | Setup step 3 sets up the ruleset and checks it; the environment check requires `can_admins_bypass == false` | 3 fixture tests; `env-admin-bypass`, `ruleset-no-last-push`, `ruleset-any-bypass` |
| H5 | Code that isn't code-owned can neuter the proof | A CI step of its own before `bun install`, with an empty `--config` and `--tsconfig-override`. `run-bun-tests.ts` leaves CODEOWNERS | 2 tests; `ci-reads-bunfig`, `ci-reads-tsconfig`, `ci-after-install` |
| H6 | `mktemp`, `cp` and `shasum` inherit the login and the JWT pair | The loop un-exports the kept names, and the launcher exports them just before `exec` | the stub test; `exports-early` |
| H7 | Pins and the Bun binary | An optional `vars.BUN_SHA256` check, and `exec` of the checked path. The pin TODOs and "The two jobs" name the upstream tag's peeled commit | 4 tests; `unchecked-bun`, `bun-digest-unchecked-format`, `bun-digest-wrong-file`. Taking the SHAs needs network and stays the owner's |
| N1 | `SSLKEYLOGFILE` | The script refuses it | its refusal test; `logs-tls-keys` |
| N2 | Computed module loads | The import test bans each form | `builtin-module`, `meta-require`, `computed-require`, `computed-import`, all missed by the old test |
| N3 | The design's bash claim | Rewritten from probes of bash 3.2.57 and 5.3.20; a test holds the fail-closed result on any bash | `no-refusal-odd-name` |
| N4 | `BASH_FUNC_shasum%%` defeats the digest check | Recorded under "What runs beside the login". The pins are the boundary | none possible in this repository |
| N5 | `pipefail` for the digest command | It reads into a variable under `set -euo pipefail` before `gh` starts | the scratch-repository test; `digest-without-pipefail`, `digest-round-1` |
| N6 | CODEOWNERS | Adds the runner, `releasing.md` and the design | the CODEOWNERS test; `runner-unowned`, `docs-unowned-later` |
| N7 | Unverified without network | The owner's dry run | owner step |
| N8 | `GH_TOKEN` at job level in `submit-amo` | Moved into the one step that calls `gh`, and the same in `github-release` and `pages`. The tests treat `github.token` and `github` whole like secrets | `bulk-github`, `job-level-token` |
| List | No repository-level `REVIEWER_NOTES_SHA256` | A setup check, which also covers `BUN_SHA256` | its fixture test; `repo-digest-allowed` |
