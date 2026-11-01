# G28: the reviewer test account in CI

Status: **proposal, not approved.** Both jobs that read the secret start with `if: false && …`, so GitHub skips them. Nothing here has run against a real secret. This version reworks the first proposal for every finding of the first secret-flow review (`ci-reviewer-credentials-review-1.md`); the last section maps each finding to its fix.

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
| Administrators bypass protection rules | off |
| Secrets | `AMO_REVIEWER_LOGIN`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` (the same pair as `amo`) |
| Variables | `REVIEWER_NOTES_SHA256`, the digest of the approved script |
| Jobs that use it | `check-reviewer-login` and `fill-reviewer-notes` in `release.yml`, and no other (tested) |

"Main only" is the boundary that stops another branch's copy of `release.yml` from reaching the secret, since a workflow on another branch can drop any check written in the workflow itself. So it is a precondition the owner checks before storing anything. `releasing.md` gives two `gh api` commands that print `true` only when `main` alone may deploy and the owner is the required reviewer. Both print nothing secret.

**The digest lives in the environment.** `vars.REVIEWER_NOTES_SHA256` is an environment variable only the owner can set. The workflows hold no digest, and a test fails if one appears. Whoever edits the script can no longer move the pin in the same pull request. The owner computes the digest from the approved commit (`git show <commit>:scripts/amo-reviewer-notes.ts | shasum -a 256`).

**Code owners.** `.github/CODEOWNERS` names the owner for itself, `.github/workflows/**`, the script, its tests and fixture, `scripts/run-bun-tests.ts`, `package.json` and `bun.lock`. It takes effect once the `main` ruleset requires review from Code Owners, which `releasing.md` now lists in the setup. Nothing in this repository can check the ruleset, so the owner checks it as setup step 3.

## The two jobs

`check-reviewer-login` needs `meta` and `build`, and runs for a push to `main` that releases a stable version with `PUBLISH_AMO` set. `submit-amo` needs it and runs only when it succeeded or was skipped, never after it failed. `fill-reviewer-notes` needs a successful check and a successful `submit-amo`. Betas skip both jobs, so a beta release neither hands the login to a runner nor asks for extra approvals. Their notes carry no placeholders, and the script would print `skipped` for them anyway.

Each job has four steps and nothing else:

1. `actions/checkout`, sparse, with only `/scripts/amo-reviewer-notes.ts` and `persist-credentials: false`. No `package.json`, lockfile, `bunfig.toml` or `tsconfig.json` reaches the runner.
2. `oven-sh/setup-bun` with `bun-version: 1.4.3` (a test holds it to `package.json`'s `packageManager`) and `no-cache: true`, so no cache entry another job saved can replace the binary.
3. `actions/download-artifact`, for the build's `dist/amo-metadata.json`.
4. The step that reads the login. Its `run:` block:
   - copies the paths it needs into shell variables, then unsets every exported name except `PATH` and the login (and, for the fill, `FIREFOX_EXTENSION_ID` and the JWT pair);
   - refuses unless `vars.REVIEWER_NOTES_SHA256` is a SHA-256 digest;
   - makes a fresh directory with `mktemp -d "$RUNNER_TEMP/reviewer-notes.XXXXXX"`, copies the script and an empty `empty.toml` into it, and checks the copy's digest;
   - sets `HOME` to that directory and runs `exec bun --no-env-file --config=empty.toml amo-reviewer-notes.ts check|fill …`.

Each action is still on its tag. **The owner pins each to a commit SHA before turning the jobs on.** This session had no network, and nothing on this machine records which commit `actions/checkout@v7`, `oven-sh/setup-bun@v2` or `actions/download-artifact@v8` resolves to. Each `uses:` line carries `# TODO(owner, G28)`, and a test fails if a job is turned on while any of its actions isn't pinned to a 40-character SHA.

### Step by step, and where the value is at each step

| # | Where | What holds the value | For how long |
|---|---|---|---|
| 1 | GitHub's encrypted secret store, `amo-reviewer` environment | the secret | until the owner replaces or deletes it |
| 2 | `check-reviewer-login` starts once the owner approves the `amo-reviewer` deployment, and only from `main`. GitHub hands the job's secrets to an ephemeral runner, which registers each with its log masker. | the runner process | the job |
| 3 | The three pinned actions | They run in a job that holds the secrets, so they are code the approval covers. None receives the login as an input. | each action's run |
| 4 | "Check the reviewer test account" | the step's `env`, then its `bash`, which strips every other name before `exec` | about a second |
| 5 | `bun amo-reviewer-notes.ts check` | the parsed login in memory | until that process exits |
| 6 | `submit-amo`, in the `amo` environment | nothing. It has no access to `amo-reviewer`, so its `bun install`, `wxt submit`, `web-ext sign` and `amo-version.ts` never get the login | |
| 7 | `fill-reviewer-notes`, after a second approval of `amo-reviewer` | as in rows 2 to 4, with the JWT pair and the GUID kept as well | one to three seconds |
| 8 | `bun amo-reviewer-notes.ts fill` | the login and the filled notes in memory, then the TLS request body to `addons.mozilla.org`. A redirect fails instead of being followed, and the request gives up after 30 seconds | until that process exits |
| 9 | AMO | the version's `approval_notes`, which AMO shows to its reviewers and the add-on's authors | until replaced, and possibly longer: AMO likely keeps earlier notes in the version's review history (unverified) |

The version reaches AMO with the placeholders first, because `wxt submit` uploads the build's `dist/amo-metadata.json`. The fill follows once `submit-amo` has confirmed the version and its sources. If the fill fails, the version shows the placeholders until **Re-run failed jobs**, which runs the fill again. The PATCH is idempotent.

## What runs beside the login

Only these, and each is part of the approval:

- **The three actions,** each at the commit the owner pins.
- **The step's `bash`.** It reads `BASH_ENV` and imports exported functions before the `run:` block starts, so the block can't strip those. Only the three actions run before it in the job, and they could set them through `GITHUB_ENV`. The pins are the defence here.
- **Bun 1.4.3,** as setup-bun downloads it. Its environment is the allowlist above. It starts from a fresh directory with an empty config, so no `bunfig.toml` can preload code. On Bun 1.4.3, `--config=<empty file>` stopped a `bunfig.toml` in the working directory from preloading, and `BUN_OPTIONS="--preload …"` still preloaded through it. The allowlist removes `BUN_OPTIONS`. The binary isn't checked against a digest; a pinned digest of the Bun release zip would need network to obtain.
- **The script.** It refuses to run when any `BUN_*`, `NODE_*` or `SSL_CERT_*` variable or `http_proxy`, `https_proxy` or `all_proxy` (any case) is set. That covers names the allowlist can't remove. Bash passes through environment entries whose names aren't shell identifiers (`A-B=1` survived a probe), and it can't unset them. Bun reads none of those names; the script refuses any that start with `BUN_` or `NODE_`.

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

- **Logs.** The script prints one line built from constants, line numbers, counts, the version, placeholder names and an HTTP status. The `run:` blocks name `AMO_REVIEWER_LOGIN` only in the allowlist and never expand it. The tests run both real `run:` blocks under `bash -x` and find no form of any part of the login in stdout or in the trace. The runner's masking stays a backstop and is not the boundary. It masks one encoding at a time, so a value escaped twice would get through it.
- **Argv of every spawned process.** The value arrives through the step's env only. The `bash -x` trace shows the expanded argv of every command the step spawns (`mktemp`, `cp`, `shasum`, `bun`), and none holds any part. The script has no way to spawn. Bun's own import scanner lists `node:crypto` and `node:fs` as its only imports, which catches side-effect imports, `export … from`, `require` and `import()` too.
- **Artifacts.** The only artifact, `release-<version>`, comes from the `build` job. A test runs the real `amo-metadata.ts` with `AMO_REVIEWER_LOGIN` set and finds only the placeholders in the file it writes. Neither reviewer job uploads anything.
- **The GitHub release, the sources zip and the committed notes.** The jobs that make them can't use `amo-reviewer`. `store/notes/reviewer-*.md` hold only placeholders, and no job writes back to the repository.
- **The uploaded metadata.** `wxt submit` and `web-ext sign` upload `dist/amo-metadata.json` with the placeholders. A test checks that it is byte-identical after the fill.
- **Files on the runner.** The script writes none. The launcher's directory under `$RUNNER_TEMP` holds the script copy, the empty config, and whatever Bun caches under `HOME` (on macOS, `Library/`). GitHub empties `$RUNNER_TEMP` after each job. The end-to-end test scans every file left in the workspace, that directory included.

## Failure paths

Every line goes to stdout, where GitHub turns `::error::` into an annotation. None quotes the login, the notes, AMO's answer or an exception message.

| Situation | Job | Prints | Exit | State on AMO | The owner then |
|---|---|---|---|---|---|
| The notes ask for no account | both | `reviewer-notes: skipped (the notes have no test-account placeholders)` | 0 | unchanged | nothing |
| All good | check | `reviewer-notes: ready` | 0 | nothing submitted yet | nothing |
| All good, AMO echoes the notes | fill | `reviewer-notes: filled (AMO version 2.0.0, confirmed)` | 0 | filled | nothing |
| All good, AMO's answer omits the notes | fill | `reviewer-notes: filled (AMO version 2.0.0; its answer does not show the notes)` | 0 | filled, unconfirmed | checks the Developer Hub once |
| `vars.REVIEWER_NOTES_SHA256` unset or not a digest | both | `::error::vars.REVIEWER_NOTES_SHA256 is not a SHA-256 digest (G28)` | 1 | nothing submitted if at check | sets it from the approved commit |
| Script differs from the digest | both | `::error::amo-reviewer-notes.ts is not the approved version (G28)` | 1 | nothing submitted if at check | re-approves, then updates the variable |
| A `BUN_*`, `NODE_*`, `SSL_CERT_*` or proxy variable reaches the script | both | `::error::reviewer-notes: environment-unsafe (a BUN_, NODE_, SSL_CERT_ or proxy variable is set)` | 1 | nothing submitted if at check | finds what set it; the allowlist should have removed it |
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

`tests/integration/amo-reviewer-notes.test.ts`, 55 tests, all passing. They run in `bun run test:bun` through the `./tests` entry. At the base commit the file had 33 tests and one failed: it ran `amo-metadata.ts --strict` on a stable build and expected success, but `--strict` fails on the four test-account placeholders. The first proposal's "the tests pass" was wrong. The test now builds without `--strict` and says why.

- Every value is a fake. The password is `dummy-reviewer-password-0000"\$&{code1}`, the codes are `0000 1111` and `2222 3333`, and the JWT pair is `dummy-jwt-issuer-0000` and `dummy-jwt-secret-0000`. Each child process gets an environment built from scratch. Dummies go through env, never argv, and no test name holds a value. A failing leak check names the leaked field, never its value.
- **The leak check** looks for each value raw, JSON-escaped once and twice, URL-encoded (with `%20` or `+`), in base64 and base64url at all three byte offsets, and each of those again with spaces removed, so `00001111` counts as the first code. A test feeds it each value in each of those forms, built independently, and expects it found.
- **Real fetch.** `tests/integration/fixtures/fake-amo.ts` is a local HTTP or HTTPS server, and the script's own `fetch` reaches it over a socket. The only change to the script under test is the API origin, and, for one test, the timeout. Each is a string swap that a test checks matched exactly once. The server answers in eight ways: store, store without echoing, a cut-off body, other notes, a 400 quoting the notes, a dropped connection, no answer, and a 308 to a second server that records what reaches it.
- **The real `run:` blocks.** The step tests take both blocks from `release.yml`, map each step's `env:` expressions to dummies, and run them under GitHub's `bash --noprofile --norc -eo pipefail`, plus `-x`, in a temporary runner workspace.
- **A tampered runner.** The fill step runs with `BUN_CONFIG_VERBOSE_FETCH=curl`, with `BUN_OPTIONS="--preload <planted file>"`, with a `bunfig.toml` that preloads planted in the workspace, `scripts/`, `RUNNER_TEMP` and `HOME`, and with `NODE_TLS_REJECT_UNAUTHORIZED=0` or `NODE_EXTRA_CA_CERTS` against an HTTPS fake whose certificate nothing trusts. Nothing leaks, the planted code never runs, and the untrusted server never gets a request. The script alone refuses each of seven unsafe variables before AMO hears anything.
- **The workflows.** Every workflow reads secrets only as `secrets.NAME`. `secrets['…']`, `toJSON(secrets)` and a `secrets:` key fail. No workflow- or job-level `env` holds a secret. `AMO_REVIEWER_LOGIN` appears in exactly the two reviewer steps. Only the two reviewer jobs use `amo-reviewer`. Both stay off, can't turn on while an action is unpinned, check out only the script without credentials, run nothing but the three actions and their step, and install the declared Bun without a cache. `submit-amo` waits for the check, and the fill waits for both. The workflows hold no digest.

**Each test was shown to catch a break.** `.audit/2.0-build/ci-reviewer-credentials-mutations.sh` copies the G28 files to a scratch directory, plants one break, and expects named tests to fail. All 17 are caught:

| Break | Tests that fail |
|---|---|
| the script as it was at `14365d0d7` | 12: the 7 refusals, the redirect, the hang, the dropped connection, and the 2 certificate tests, whose fixed line changed |
| `redirect: "error"` removed | the redirect test |
| the timeout disabled | the hang test |
| the environment check removed | the 7 refusals |
| `import "node:vm"` added | the import test (the old tests passed it) |
| `export * from "node:os"` added | the import test (the old tests passed it) |
| the allowlist loop removed | 4 tampered-runner tests |
| the launcher run from `RUNNER_TEMP` without the empty config | 3, including the planted `bunfig.toml` |
| the check job's `false && ` removed | the gate and the pin tests |
| a digest written into the workflow | 18 |
| the digest-format check removed | 2 |
| `submit-amo` moved into `amo-reviewer` | the environment test |
| `toJSON(secrets)` in `ci.yml` | the secret-reference test |
| `secrets['AMO_REVIEWER_LOGIN']` in `ci.yml` | the secret-reference test |
| the fill step's old launcher with the old script | 16, including all 5 tampered-runner tests |
| `ci.yml` as it was, with the JWT pair in job env | the job-level env test |
| the old two-form leak check | the leak-check test |

## Unverified, to settle when turning it on

- **AMO accepts `approval_notes` on the version edit endpoint.** This comes from AMO's v5 API docs as I recall them; this session had no network. The endpoint and its JWT already work for `source` and `compatibility`. After the first approved release, the owner looks once at the version's "Notes to Reviewer" in the Developer Hub.
- **Whether AMO's answer includes `approval_notes`,** and whether AMO keeps earlier notes in the version's review history. The script handles both answers. If AMO keeps a history, replacing the notes won't erase the login, and the owner rotates the backup codes after each review anyway (REL-CHK-24).
- **A job skipped by its `if` gets no secrets.** As I understand GitHub Actions, a skipped job is never sent to a runner. So storing the secret before turning the jobs on is safe, unlike the first proposal's step-level `if: false`.
- **The runner gets every secret of the job's environment,** not only the ones the job names. The design assumes it does, which is why the check job holds the JWT pair too.
- **setup-bun's input is called `no-cache`.** From memory of its `action.yml`. The owner confirms it at the commit they pin. An unknown input is only a warning, and the cache would then stay on.
- **The field names in the two `gh api` checks** (`deployment_branch_policy`, `protection_rules[].reviewers[].reviewer.login`, `branch_policies[].type`). From memory of the REST docs. A wrong name makes a check print `false` or fail, never print `true`.

## Findings outside this change

- **A stable release can't build today.** `amo-metadata.ts --strict` reports `{email}`, `{password}`, `{code1}` and `{code2}` as unfilled and exits 1, so the `build` job fails before any of this runs. Turning G28 on needs `amo-metadata.ts` to let those four through a release build. That file never sees the value and isn't in this change.
- `scripts/amo-version.ts` prints AMO's raw body when a request fails. It no longer runs in a job that holds the login. AMO's answer to its `status` lookup after a fill may contain the filled notes, but on success it prints only `missing`, `no-source` or `present`.
- The test suite as a whole ran past a 9-minute deadline on this machine, with an unrelated timeout in `src/background/store/claim-notice.bun-test.ts`. The reviewer-notes file passes alone and through the runner's own flags.

## What the owner approves

The owner's rules require three things before this runs: these credential-free behavior tests, a separate agent review of the secret flow, and the owner's approval. The tests are done and pass. **The second review has not run.** The approval covers the files below at one commit, and a change to any of them needs all three again.

1. `scripts/amo-reviewer-notes.ts`, whose digest at that commit goes into `vars.REVIEWER_NOTES_SHA256`. It is the only code that reads the value.
2. `.github/workflows/release.yml` as a whole. It decides which jobs use `amo-reviewer`, in what order they run, that a failed check stops `submit-amo`, and what the reviewer steps run.
3. In each reviewer job, the three actions at the commit SHAs the owner pins, and Bun 1.4.3 as `oven-sh/setup-bun` installs it.
4. The tests and what runs them: `tests/integration/amo-reviewer-notes.test.ts`, `tests/integration/fixtures/fake-amo.ts`, `scripts/run-bun-tests.ts`, `package.json`'s test scripts and the Test step in `ci.yml`, and `.audit/2.0-build/ci-reviewer-credentials-mutations.sh`.
5. `.github/CODEOWNERS`.
6. `docs/development/releasing.md`, the "reviewer test account" section, which is the owner's procedure for the environment and the secret.
7. This design.
8. Settings, which are not files. The `amo-reviewer` environment (required reviewer, `main` only, admin bypass off, its three secrets and its variable), the `main` ruleset with review from Code Owners, and `vars.PUBLISH_AMO`.

The first proposal's list also had `package.json`, `bun.lock`, `amo-version.ts` and `check-signed-build.sh`, because they ran in `submit-amo` beside the login. They no longer share a job with it. `scripts/amo-metadata.ts` and the `store/notes/` templates write the notes the fill sends. A changed template can change what AMO receives, but not where the request goes. The owner may add them to the list.

## Turning it on, after approval

1. The owner pins the three actions in both reviewer jobs to commit SHAs, replacing each `# TODO(owner, G28)`, and confirms the `no-cache` input at the pinned setup-bun.
2. `amo-metadata.ts` lets the four test-account placeholders through a release build, in its own change.
3. The owner sets up `amo-reviewer` as `releasing.md` describes, in order. Storing the secret before step 4 is safe, because GitHub skips the jobs.
4. A commit deletes `false && ` from both jobs' `if` and updates the test "stay off until the owner approves G28". The pin test then requires the SHAs from step 1. The owner reviews and merges it like any other change to `main`.
5. After the first release that uses it, the owner checks the version's "Notes to Reviewer" on AMO once.

## How the first review's findings were addressed

| # | Finding | Change | Evidence |
|---|---|---|---|
| 1 | The secret steps share `submit-amo` with third-party code | Two jobs of their own in the `amo-reviewer` environment, gated at job level. Sparse checkout of the script with no persisted credentials, no install, a fresh `mktemp -d` under `RUNNER_TEMP`. Actions pinned by the owner (TODO) | workflow tests; the gate, pin and environment plants |
| 2 | Bun's environment prints the notes | An allowlist before `exec bun`, an empty `--config`, and the script refuses unsafe variables | 5 tampered-runner tests, 7 refusal tests; the allowlist, old-runner and old-script plants |
| 3 | The request follows redirects | `redirect: "error"` and a 30-second timeout | redirect and hang tests against a real server |
| 4 | The pin isn't a frozen copy | `vars.REVIEWER_NOTES_SHA256` in the environment, CODEOWNERS, a checked main-only precondition | digest tests and plants; `releasing.md` setup steps 2 to 4 |
| 5 | `FIREFOX_JWT_*` in job-level env | Moved to the steps that call AMO in `ci.yml`'s `sign-firefox` and `release.yml`'s `submit-amo` | the job-level env test and plant |
| 6 | Test gaps | Stronger leak check, real fetch, hostile environments, a planted `bunfig.toml`, Bun's import scanner, a secret scan of every workflow | the leak-check test and its plant; the import and secret-reference plants |
| 7 | Nits | The 1Password command reads into a variable first; the setup list is whole again; the value table is rewritten; AMO's review history is noted | this document and `releasing.md` |
