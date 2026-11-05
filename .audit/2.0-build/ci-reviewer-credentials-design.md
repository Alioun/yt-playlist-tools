# G28: the reviewer test account in CI

Status: **proposal, not approved.** Both jobs that read the secret start with `if: false && …`, so GitHub skips them. Nothing here has run against a real secret. This version answers five secret-flow reviews: `ci-reviewer-credentials-review-1.md`, `ci-reviewer-credentials-review-2.md`, and the third, fourth and fifth, reported in their own sessions. After the fifth, the owner decided to close the review rounds once its findings were fixed, with no sixth review. The sections at the end map each finding to its fix.

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

**Code owners.** `.github/CODEOWNERS` names the owner for itself, `.github/workflows/**`, the script, its tests, the whole `tests/integration/fixtures/` directory, the planted-break runner, this design, `docs/development/releasing.md`, `package.json` and `bun.lock`. A test resolves every file the approval covers through CODEOWNERS and expects the owner, and it expects the owner for everything either covered directory holds now or later. Every line must be a path from the repository's top with no wildcard but a final `/**`, then `@logins`, and a test fails any other line. GitHub's CODEOWNERS ignores some gitignore syntax, such as `!`, `[ ]` and `{a,b}`, so a matcher that read those could disagree with GitHub. In the forms left, `/x` owns the file `x` or everything in the directory `x`, `/x/**` owns everything in `x`, and the last matching line wins. A directory counts as owned only when the last line covering all of it names the owner and so does every line inside it.

**The `main` ruleset.** Code owners count only once the ruleset requires their review, and only if a later push can't slip past that review. The ruleset needs at least one approval, review from Code Owners, approval of the most recent reviewable push, stale approvals dismissed on push, and CI's `g28-proof` check, the job that runs the proof. `release.yml` and `pages.yml` each have a `build` job that a dispatch can run, so a check named `build` could come from either, and a test fails any other job whose name or ID is `g28-proof` or whose name is computed. Its bypass list holds the Repository admin role, which in a personal repository is the owner alone, or nothing. Without last-push approval, a commit pushed after the owner approved would merge without the owner's review, and an agent could merge it. `releasing.md` setup step 3 sets the ruleset up and gives `true`/`false` checks for it. Tests run each check against fixture API answers.

## The two jobs

`check-reviewer-login` needs `meta` and `build`, and runs for a push to `main` that releases a stable version with `PUBLISH_AMO` set. `submit-amo` needs it and runs only when it succeeded or was skipped, never after it failed. `fill-reviewer-notes` needs a successful check and a successful `submit-amo`. Betas skip both jobs, so a beta release neither hands the login to a runner nor asks for extra approvals. Their notes carry no placeholders, and the script would print `skipped` for them anyway.

Each job runs on `ubuntu-24.04`, a named image, so a move of `ubuntu-latest` to a new image needs the owner's approval. A test compares each job's keys and values whole, each step's key set, and the login step's `env`. Each job has four steps and nothing else:

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

Each `uses:` line carries `# TODO(owner, G28)`, and a test fails if a job is turned on while any of its actions isn't pinned to a 40-character SHA. The same holds for the checkout and setup-bun in `ci.yml`'s `g28-proof` job, which carry the same marker. A moved tag there could fake the proof, so the test also fails if either reviewer job is turned on while one of them is on its tag. The owner takes their SHAs the same way, from `actions/checkout` and `oven-sh/setup-bun`.

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

An environment entry whose name isn't a shell identifier, such as `BUN_CONFIG_VERBOSE-FETCH`, behaves differently by bash version. Measured here with dummy values, bash 3.2.57 lists it in `compgen -e`, its `unset` fails, and `-e` stops the step before Bun starts. Homebrew's bash 5.3.20 leaves it out of `compgen -e`, so it reaches Bun, and the script refuses it by its prefix. The second review saw a bash 5.3 stop the step. The bash 5.2 on `ubuntu-24.04` is unprobed. For a `BUN_` or `NODE_` name the step fails closed on every bash, and a test holds that on whichever bash runs it. A name with any other prefix reaches Bun on a bash that passes it through. Bun reads its settings only from names that are shell identifiers (inferred from its documented variables, not probed).

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

`tests/integration/amo-reviewer-notes.test.ts`, 108 tests, all passing. CI runs them in `ci.yml`'s `g28-proof` job, which holds checkout, setup-bun (with `no-cache: true`) and this step, and nothing else:

```sh
: > "$RUNNER_TEMP/empty.toml"
echo '{}' > "$RUNNER_TEMP/empty.json"
report=$RUNNER_TEMP/reviewer-login-proof.xml
rm -f "$report"
env -i PATH="$PATH" HOME="$HOME" RUNNER_TEMP="$RUNNER_TEMP" bun --config="$RUNNER_TEMP/empty.toml" test --no-env-file \
  --tsconfig-override="$RUNNER_TEMP/empty.json" --reporter=junit --reporter-outfile="$report" \
  ./tests/integration/amo-reviewer-notes.test.ts
grep -Eq '^<testsuites name="bun test" tests="108" assertions="[0-9]+" failures="0" skipped="0" ' "$report" \
  || { echo "::error::the G28 proof did not pass all 108 of its tests"; exit 1; }
```

The count check is there because Bun exits 0 when a file exits 0 before it registers its tests. The third review planted a `fake-amo.tsx` that did so, and the step passed with no test run. A change that adds or removes a test changes the number in `ci.yml` too, which needs the owner's review like the rest of the file.

The repository's `bunfig.toml` preloads four `tests/setup/*.ts` files, and `tsconfig.json` extends `.wxt/tsconfig.json`, which `bun install` writes. None of them is code-owned, and through the full suite each could neuter the proof. A planted `tsconfig.json` whose `paths` maps `*` to its own file made `bun test` register no test in the file and still exit 0. Each override alone still let the other file through, and both together stopped both. Before the install, with both overrides, only code-owned files decide the result. `BUN_OPTIONS=--preload=…` and `BUN_INSPECT_PRELOAD=…` still preload with `--config` (both measured on Bun 1.4.3), and the fourth review made such a preload write a passing junit report and exit 0. A workflow-level `env`, or a step before the proof writing `$GITHUB_ENV`, could set either. A test compares `ci.yml`'s top-level keys whole, so the workflow holds no `env`, and the job test holds the steps before the proof to checkout and setup-bun. Those two actions still run first and could write `$GITHUB_ENV` if their tags moved, and Bun reads more `BUN_` names than any list here would name. So the step starts Bun from an empty environment with `env -i`, passing on only `PATH`, `HOME` and `RUNNER_TEMP`. Bun itself needs only `PATH`, for `env` to find it and for the file to find `bash`, `git` and `openssl`. `HOME` and `RUNNER_TEMP` are the runner's own values, and Bun adds `NODE_ENV` itself. A test hands the step `BUN_OPTIONS`, `BUN_INSPECT_PRELOAD`, `NODE_OPTIONS` and two other `BUN_` names, and expects no preload to run and the file to see only those four names. The full suite still runs the file a second time, with the preloads. That run proves nothing extra and isn't part of the approval.

At the first proposal's base commit the file had 33 tests and one failed: it ran `amo-metadata.ts --strict` on a stable build and expected success, but `--strict` fails on the four test-account placeholders. That test now builds without `--strict`, and since the third review it lives in `tests/integration/amo-metadata-login.test.ts`, which the full suite runs. `amo-metadata.ts` isn't code-owned, so it can't run inside the proof. The proof keeps the half that fills from a fixture's metadata and finds the login in no file.

- Every value is a fake. The password is `dummy-reviewer-password-0000"\$&{code1}`, the codes are `0000 1111` and `2222 3333`, and the JWT pair is `dummy-jwt-issuer-0000` and `dummy-jwt-secret-0000`. Each child process gets an environment built from scratch. Dummies go through env, never argv, and no test name holds a value. A failing leak check names the leaked field, never its value.
- **The leak check** looks for each value raw, JSON-escaped once and twice, URL-encoded (with `%20` or `+`), in base64 and base64url at all three byte offsets, and each of those again with spaces removed, so `00001111` counts as the first code. A test feeds it each value in each of those forms, built independently, and expects it found.
- **Real fetch.** `tests/integration/fixtures/fake-amo.ts` is a local HTTP or HTTPS server, and the script's own `fetch` reaches it over a socket. The only change to the script under test is the API origin, and, for one test, the timeout. Each is a string swap that a test checks matched exactly once. The server answers in eight ways: store, store without echoing, a cut-off body, other notes, a 400 quoting the notes, a dropped connection, no answer, and a 308 to a second server that records what reaches it.
- **The real `run:` blocks.** The step tests take both blocks from `release.yml`, map each step's `env:` expressions to dummies, and run them under GitHub's `bash --noprofile --norc -eo pipefail`, plus `-x`, in a temporary runner workspace. `vars.BUN_SHA256` is empty unless a test sets it to the running Bun's digest, to another digest, or to a non-digest.
- **A tampered runner.** The fill step runs with `BUN_CONFIG_VERBOSE_FETCH=curl`, with `BUN_OPTIONS="--preload <planted file>"`, with a `bunfig.toml` that preloads planted in the workspace, `scripts/`, `RUNNER_TEMP` and `HOME`, with a `tsconfig.json` or `jsconfig.json` mapping every import to planted code one and two levels above the script, with `NODE_TLS_REJECT_UNAUTHORIZED=0` or `NODE_EXTRA_CA_CERTS` against an HTTPS fake whose certificate nothing trusts, and with a `BUN_` name that isn't a shell identifier. Nothing leaks, the planted code never runs, and the untrusted server never gets a request. Stubs for `mktemp`, `cp` and `shasum` record that none of them sees the login or the AMO keys. The script alone refuses each of eight unsafe variables before AMO hears anything.
- **This file.** Its only relative import is `./fixtures/fake-amo.ts`, by its full name, since Bun tries `.tsx` before `.ts` for a name without one. A test checks the lines that name `root`, and catches only the literal forms it knows. Each such line must be the declaration, a stat-only helper that tells a file from a directory, or `join(root, "<path>")` with one literal path that has no `.` or `..` part, and each literal path must resolve to the owner in CODEOWNERS, as a file or as a whole directory. The test fails `join(root, "scripts", name)`, `resolve(root, …)`, `` `${root}/…` `` and an alias. Many forms get past it, such as text added after a join (`join(root, "…") + "/../…"`), a nested join, `resolve(import.meta.dir, …)` or a path relative to the working directory. It doesn't try to catch every form. The owner's review of this code-owned file is the boundary, and the test only catches the plain mistakes.
- **The workflows.** Every workflow reads secrets and the job token only by name, in any case, as GitHub reads them: `secrets['…']`, `toJSON(secrets)`, `toJSON(SECRETS)`, a `secrets:` key, `GITHUB.TOKEN` at job level, and `github` whole (as in `toJSON(github)`) fail. No workflow sets `defaults`. Every `actions/checkout` in a job that can write sets `persist-credentials: false`. No workflow- or job-level `env` holds a secret or `github.token`. `AMO_REVIEWER_LOGIN` appears in exactly the two reviewer steps. Every environment name is literal, every job-level `uses:` calls a workflow under `./.github/workflows/`, and only the two reviewer jobs use `amo-reviewer`. Both run on `ubuntu-24.04` with exactly the keys, values and step keys the approval covers. Both stay off, compared whole against their expected condition, can't turn on while an action is unpinned, check out only the script without credentials, run nothing but the three actions and their step, and install the declared Bun without a cache. `submit-amo` waits for the check, and the fill waits for both. The workflows hold no digest.
- **The CI job.** `ci.yml`'s top-level keys (`name`, `on`, `permissions`, `concurrency`) are compared whole, so it has no workflow-level `env`. The `g28-proof` job is compared whole too: `runs-on` and three steps, checkout, setup-bun with the declared Bun and no cache, and the proof with only a name and a `run:`. No other job in any workflow has `g28-proof` as its ID or name, and none computes its name. Tests run the proof's real `run:` block against stand-in test files with the expected number of tests. Beside a `bunfig.toml` that preloads and a `tsconfig.json` that redirects `node:fs`, and with `BUN_OPTIONS`, `BUN_INSPECT_PRELOAD` and `NODE_OPTIONS` naming preloads, the stand-in passes and nothing planted takes effect. With two other `BUN_` names set, the stand-in sees only `HOME`, `NODE_ENV`, `PATH` and `RUNNER_TEMP`. The job's checkout and setup-bun carry `# TODO(owner, G28)`, and the pin test counts them. A stand-in with one failing test, one test fewer, one skipped test, or a `process.exit(0)` before its tests fails the step.
- **CODEOWNERS.** Every line has one of the two forms, and ten lines in other forms (negation, braces, brackets, a wildcard, a path without the leading `/`, a trailing `/`, a `..`, a team and a trailing comment) are left unread. Every file the approval covers is a file and resolves to the owner, and both covered directories are directories the owner owns whole. Nine cases hold the matcher to GitHub's reading of the two forms.
- **The owner's commands in `releasing.md`.** Each `--jq` filter runs through `jq` against fixture API answers. It prints `true` for the settings the setup asks for, and `false` when any one is weakened or missing: administrator bypass, another reviewer, protected-branch deployment, a repository-level digest in any case, each pull-request rule parameter, the `g28-proof` status check (a `build` check alone fails), a GitHub App, deploy key or lesser role in the bypass list, a hidden bypass list, and evaluate-only enforcement. The ruleset block runs with a stub `gh` that answers from fixtures through `jq`, in bash, in bash with `IFS` empty (which splits words as zsh does, not at all), and in zsh where it is installed. With two rulesets it prints a line for each, `false` for one `gh` can't read, and `false` when no ruleset applies to `main` or `gh` fails. The old `for id in $ids` loop ran `gh` once with both IDs under zsh. The digest command runs in a scratch git repository with a stub `gh` as the only `gh` on `PATH`. It passes the approved script's digest to `gh`, and with a missing commit it fails without calling `gh`.

**Each test was shown to catch a break.** `.audit/2.0-build/ci-reviewer-credentials-mutations.sh` copies the G28 files to a scratch directory, plants one break, runs `ci.yml`'s real proof step against the copy in a scratch environment, and reads Bun's junit report. A row expects named tests to fail, or the step itself to fail with a given line. A test that timed out never counts as a catch. Two control rows plant nothing that should matter and must pass with no test failed: `control` plants nothing, and `planted-tsx-beside-full-name` plants a `fake-amo.tsx` that exits 0. Naming rows after the base commit runs only those. All 101 breaks are caught and both controls pass:

| Row | Break | Tests that fail |
|---|---|---|
| control | nothing | none, and the step passes |
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
| g28-proof-unpinned-gate-open | the check job's actions pinned and its `false && ` removed, with `g28-proof`'s actions still on their tags | the gate and pin tests; the fourth round's pin test passed it |
| check-gate-widened | `\|\| vars.G28_ON == 'true'` after the check job's condition | the gate and pin tests, which passed it before |
| fill-gate-widened | `\|\| always()` after the fill job's condition | the gate and pin tests, which passed it before |
| digest-in-repo | a digest written into the workflow | 22 |
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
| ci-after-install | a `bun install` step before the proof | the job test (6 in all, as the proof moves down a step) |
| runner-unowned | the runner's CODEOWNERS line removed | the CODEOWNERS test |
| docs-unowned-later | a later CODEOWNERS line with no owner for `releasing.md` | the CODEOWNERS test and the test of this file's paths |
| env-admin-bypass | the environment check without `can_admins_bypass` | the environment-check test |
| repo-digest-allowed | the repository-variable check without `BUN_SHA256` | the repository-variable test |
| ruleset-no-last-push | the ruleset check without last-push approval | the ruleset test |
| ruleset-any-bypass | the bypass check without its actor test | the bypass test |
| digest-without-pipefail | the digest command under `set -eu` | the digest-command test |
| digest-round-1 | `releasing.md` as at `4684a5621` | 6, including the digest-command test |
| old-runner | the fill step's old launcher with the old script | 24, including all 10 tampered-runner tests |
| job-level-keys | `ci.yml` as at `14365d0d7`, with the JWT pair in job env | the job-level env test |
| old-leak-check | the old two-form leak check | the leak-check test |
| extensionless-import | the fixture imported as `./fixtures/fake-amo` | the test of this file's import |
| planted-tsx | that import, beside a `fake-amo.tsx` that exports the names and exits 0 | no test runs; the step fails on its count |
| planted-tsx-beside-full-name | the same `fake-amo.tsx` beside the full-name import | none, and the step passes |
| metadata-in-proof | the proof using `scripts/amo-metadata.ts` again | the test of this file's paths |
| fixtures-unowned | the fixtures directory's CODEOWNERS line removed | the CODEOWNERS test |
| fixture-file-owned | CODEOWNERS naming only `fake-amo.ts`, as in round 2 | the CODEOWNERS test, on a file planted later |
| proof-counts-fewer | the step expecting one test fewer | 3; the step fails on its count |
| proof-ignores-count | the count check ending in `exit 0` | the short-count tests |
| proof-or-true | `\|\| true` after `bun test`, with no count check | 6, including the failing-test case |
| proof-continue-on-error | `continue-on-error: true` on the proof step | the job test |
| proof-if | an `if` on the proof step | the job test |
| proof-job-continue-on-error | `continue-on-error: true` on the `g28-proof` job | the job test |
| proof-cached-bun | the proof's setup-bun without `no-cache` | the job test |
| ci-workflow-env | a workflow-level `env` with `BUN_OPTIONS` in `ci.yml` | the top-level keys test |
| proof-job-env | a job-level `env` with `BUN_OPTIONS` on `g28-proof` | the job test |
| proof-step-writes-env | a step before the proof writing `BUN_OPTIONS` to `$GITHUB_ENV` | the job test (6 in all) |
| proof-keeps-environment | the proof without `env -i` and its allow-list | 3, including the preload and environment tests |
| proof-deny-list | the fourth round's `env -u BUN_OPTIONS -u NODE_OPTIONS` | the preload test, through `BUN_INSPECT_PRELOAD`, and the environment test |
| proof-passes-inspect-preload | the allow-list passing `BUN_INSPECT_PRELOAD` on | 7, including the preload test |
| proof-deny-list-any-bun | a deny-list of `BUN_OPTIONS`, `BUN_INSPECT_PRELOAD` and `NODE_OPTIONS` | the environment test, through an arbitrary `BUN_` name |
| proof-name-reused | `name: g28-proof` on `pages.yml`'s build job | the check-name test |
| proof-name-computed | a computed `name` on `release.yml`'s `meta` job | the check-name test |
| reviewer-latest-image | the check job back on `ubuntu-latest` | the job-shape test |
| reviewer-container | a `container:` in the fill job | the job-shape test |
| reviewer-job-defaults | job-level `defaults` with `shell: sh {0}` | the job-shape test |
| reviewer-step-shell | `shell: sh {0}` on the fill step | the job-shape test |
| reviewer-step-continue | `continue-on-error: true` on the check step | the job-shape test |
| reviewer-step-env | an extra `BUN_CONFIG_VERBOSE_FETCH` in the check step's env | 21, including the job-shape test |
| workflow-defaults | workflow-level `defaults` in `release.yml` | the defaults test |
| upper-bulk-secrets | `toJSON(SECRETS)` in `ci.yml` | the reference test, which missed it before |
| upper-job-token | `GITHUB.TOKEN` in `submit-amo`'s job env | the job-level env test, which missed it before |
| lower-login-name | `secrets.amo_reviewer_login` in a `ci.yml` step | the login-reference test, which missed it before |
| owners-basename-later | a later `releasing.md @dummy-other` line | the form test |
| owners-directory-later | a later `fixtures/` line with no owner | the form test |
| owners-brace | a later `/scripts/{amo-reviewer-notes,amo-metadata}.ts` line | the form test |
| owners-bracket | a later `/scripts/amo-reviewer-notes.[t]s @dummy-other` line | the form test |
| owners-negation | a later `!/docs/development/releasing.md` line | the form test |
| owners-wildcard-directory | a later `/tests/*/fixtures/** @dummy-other` line | the form test |
| owners-inner-later | a later line giving `fake-amo.ts` to `@dummy-other` | the CODEOWNERS test, which the one-file probe passed |
| owners-directory-reowned | the fixtures directory given to `@dummy-other`, then the probe file back to the owner | the CODEOWNERS test |
| owners-prefix-match | the matcher without the `/` after a rule's path | 3: two examples and the CODEOWNERS test |
| owners-directory-self | a `/**` rule matching its own directory | its example |
| root-two-parts | `join(root, "scripts", "amo-metadata.ts")` in this file | the test of this file's paths |
| root-resolve | `resolve(root, "scripts/amo-metadata.ts")` | the test of this file's paths |
| root-template | `` `${root}/scripts/amo-metadata.ts` `` | the test of this file's paths |
| root-dot-dot | `join(root, ".github/workflows/../../scripts/amo-metadata.ts")` | the test of this file's paths |
| root-alias | `const top = root` | the test of this file's paths |
| root-helper-reads | the stat helper reading the file instead | the test of this file's paths and the CODEOWNERS test |
| ruleset-no-proof-check | the ruleset check without the `g28-proof` status check | the ruleset test |
| ruleset-build-check | the ruleset check requiring `build` instead | the ruleset test and the ruleset-block test |
| repo-digest-any-case | the repository-variable check without `ascii_upcase` | the repository-variable test |
| ruleset-loop-silent | the ruleset loop without its `false` for no ID | the ruleset-block test |
| ruleset-loop-split | the old `for id in $ids` loop | the ruleset-block test, in bash without word splitting and in zsh |
| ruleset-loop-gh-silent | the loop without `\|\| echo false` for a ruleset `gh` can't read | the ruleset-block test |
| submit-amo-keeps-token | `submit-amo`'s checkout keeping its token | the checkout test |
| write-all-keeps-token | `permissions: write-all` on `ci.yml`'s build job | the checkout test |

The full run of 99 rows finished in under 10 minutes on this machine, as five batches of named rows run side by side, with Homebrew's bash 5.3.20 first on `PATH`. The fifth round ran only the 25 rows its changes touch: the control, the five new rows, and the gate, pin, path, proof-step and planted-config rows. All were caught and the control passed. The other 78 rows plant breaks that this round's changes don't touch, and weren't rerun.

## Unverified, to settle when turning it on

- **AMO accepts `approval_notes` on the version edit endpoint.** This comes from AMO's v5 API docs as I recall them; this session had no network. The endpoint and its JWT already work for `source` and `compatibility`. After the first approved release, the owner looks once at the version's "Notes to Reviewer" in the Developer Hub.
- **Whether AMO's answer includes `approval_notes`,** and whether AMO keeps earlier notes in the version's review history. The script handles both answers. If AMO keeps a history, replacing the notes won't erase the login, and the owner rotates the backup codes after each review anyway (REL-CHK-24).
- **A job skipped by its `if` gets no secrets and no deployment.** As I understand GitHub Actions, a skipped job is never sent to a runner. So storing the secret before turning the jobs on is safe, unlike the first proposal's step-level `if: false`. The dry run below settles it.
- **The runner gets every secret of the job's environment,** not only the ones the job names. The design assumes it does, which is why the check job holds the JWT pair too.
- **setup-bun's input is called `no-cache`.** From memory of its `action.yml`. An unknown input is only a warning, and the cache would then stay on. The dry run settles it.
- **The step header masks all four lines of the login.** The first review read `actions/runner` as masking the whole value and each trimmed line. Nobody has seen the header for a four-line secret. The dry run settles it.
- **Which build setup-bun installs on `ubuntu-24.04`.** From memory, `bun-linux-x64` on a CPU with AVX2 and the `-baseline` build otherwise. A `vars.BUN_SHA256` for the wrong build fails closed.
- **The field names in the `gh api` checks.** `can_admins_bypass`, `deployment_branch_policy`, `protection_rules[].reviewers[].reviewer.login`, `branch_policies[].type`, the repository variables' `variables[].name`, the branch rules' `type`, `ruleset_id` and `parameters` (`required_approving_review_count`, `dismiss_stale_reviews_on_push`, `require_code_owner_review`, `require_last_push_approval`), and the ruleset's `enforcement` and `bypass_actors[]` (`actor_type`, `actor_id`). All from memory of the REST docs. A wrong name makes a check print `false` or fail, never print `true`. The Repository admin role's ID, 5, is from memory too, and it is the one exception: if 5 named a lesser role, the check would accept that role. So the owner also confirms on the ruleset page that its only bypass entry reads Repository admin.

- **GitHub's CODEOWNERS rules.** That `/x` owns everything in a directory `x`, and `/x/**` everything in it, follows GitHub's CODEOWNERS docs and their examples (`/apps/github`, `/build/logs/`, `docs/**`) as I recall them; this session had no network. Every other form fails the form test, so nothing rests on how GitHub reads it.
- **The `required_status_checks` rule's fields.** `parameters.required_status_checks[].context` is from memory of the REST docs. A wrong name prints `false`. The check accepts a `g28-proof` status from any source, so a GitHub App or a token that can write commit statuses could post one. Requiring GitHub Actions as its source would also need the app's ID, which isn't verified here.
- **Bun's junit report.** Measured on Bun 1.4.3 here: its `<testsuites>` line carries `tests`, `assertions`, `failures` and `skipped` in that order, and a timed-out test's failure has `type="TimeoutError"`. A Bun that writes it differently fails the step, never passes it.

### The owner's dry run

Three of these need GitHub itself (second review, N7). A dry run in a scratch repository with a dummy login settles them before the real secret exists.

1. Create a private scratch repository with an `amo-reviewer` environment set up as `releasing.md` describes. Store a made-up `AMO_REVIEWER_LOGIN` in it, such as `dummy@example.invalid`, `dummy-password-0000`, `0000 1111` and `2222 3333`, and set `REVIEWER_NOTES_SHA256` for the script at the commit under test.
2. Copy `check-reviewer-login`, with the pins, into a workflow there whose first job uploads a `release-<version>` artifact with an `amo-metadata.json` holding the full template.
3. Run it with `if: false && …`. The job shows as skipped, no deployment to `amo-reviewer` appears in the repository's deployments, and no approval is requested.
4. Remove `false && ` and run it again. The setup-bun step logs no `Unexpected input(s) 'no-cache'` warning.
5. In that run's log, the step's env header shows `AMO_REVIEWER_LOGIN: ***` and nothing of the four lines, and the job prints `reviewer-notes: ready`.
6. Re-run the job with **Enable debug logging** (third review, H-g). The debug lines show nothing of the four lines either.
7. Delete the scratch repository.

## Owner caveats

- **The settings are checked once (third review, H-f).** The environment, variable and ruleset checks in `releasing.md` steps 2 and 3 show the settings as they are on the day the owner runs them. Nothing in CI watches them afterwards, and an admin can change any of them. The owner reruns steps 2 and 3 before each stable release, and stops the release if any line prints `false`.
- **`submit-amo`'s token and the AMO keys are readable on the runner (fourth review, item 5).** The fourth review found that the job's user has passwordless `sudo` on GitHub-hosted runners, so any process in a job can read the runner's memory, which holds the job's secrets and its token (not run here). `submit-amo` runs `bun install`, `wxt` and `web-ext` with the AMO keys and a token that can write releases, so code from the lockfile can read both. `persist-credentials: false` and step-level `env` only keep the token out of files and other steps' environments. The proposed fix, outside this change: a separate `gh-release-upload` job with `contents: write` that downloads the signed `.xpi` as an artifact and runs `gh release upload`, with no install and no code but `gh`, while `submit-amo` drops to `contents: read`. The AMO keys stay where `wxt` and `web-ext` use them. The login never reaches `submit-amo`, and the reviewer jobs install nothing.
- **The dry run includes debug logging (third review, H-g).** Runner and step debug logging print more than a normal run, and nobody has seen what they print for a multi-line secret. The dry run's step 6 settles it with the dummy login, before the real one exists.

## Findings outside this change

- **A stable release can't build today.** `amo-metadata.ts --strict` reports `{email}`, `{password}`, `{code1}` and `{code2}` as unfilled and exits 1, so the `build` job fails before any of this runs. Turning G28 on needs `amo-metadata.ts` to let those four through a release build. That file never sees the value and isn't in this change.
- `scripts/amo-version.ts` prints AMO's raw body when a request fails. It no longer runs in a job that holds the login. AMO's answer to its `status` lookup after a fill may contain the filled notes, but on success it prints only `missing`, `no-source` or `present`.
- The test suite as a whole ran past a 9-minute deadline on this machine, with an unrelated timeout in `src/background/store/claim-notice.bun-test.ts`. The reviewer-notes file passes alone, as the CI step runs it, and with the full suite's flags and preloads.
- The fixture's untrusted certificate comes from whichever `openssl` is first on `PATH`. macOS's LibreSSL in `/usr/bin` writes an EC key that Bun can't load (`DECODE_ERROR`), so the two certificate tests fail where `/usr/bin` comes before Homebrew. Homebrew's OpenSSL works, and `ubuntu-latest` ships OpenSSL 3 (not run here).

## What the owner approves

The owner's rules require three things before this runs: these credential-free behavior tests, a separate agent review of the secret flow, and the owner's approval. The tests are done and pass. The fourth review, of the third round's fixes, found no leak and no blocker. The fifth review, of the fourth round's fixes, found two gaps, which its table near the end lists. Both are fixed here, and the owner decided that no sixth review runs. The approval covers the files below at one commit, and a change to any of them needs all three again.

1. `scripts/amo-reviewer-notes.ts`, whose digest at that commit goes into `vars.REVIEWER_NOTES_SHA256`. It is the only code that reads the value.
2. `.github/workflows/release.yml` as a whole. It decides which jobs use `amo-reviewer`, in what order they run, that a failed check stops `submit-amo`, and what the reviewer steps run.
3. In each reviewer job, the `runs-on: ubuntu-24.04` label and the runner image GitHub serves under it, the three actions at the upstream commits the owner pins, and Bun 1.4.3 as `oven-sh/setup-bun` installs it, at `vars.BUN_SHA256` if the owner sets it.
4. The proof and what runs it: `tests/integration/amo-reviewer-notes.test.ts`, the whole `tests/integration/fixtures/` directory, `.github/workflows/ci.yml`'s top-level keys (`name`, `on`, `permissions` and `concurrency`, with no `env`), its `g28-proof` job whole (checkout and setup-bun at the upstream commits the owner pins, setup-bun with `no-cache: true`, and the step "Test the reviewer-login secret flow (G28)" with `env -i PATH="$PATH" HOME="$HOME" RUNNER_TEMP="$RUNNER_TEMP"` and its expected test count of 108), `package.json`'s `packageManager` (the Bun that runs the proof), and `.audit/2.0-build/ci-reviewer-credentials-mutations.sh`.
5. `.github/CODEOWNERS`.
6. `docs/development/releasing.md`: the "reviewer test account" section and the `main` ruleset line, which are the owner's procedure for the environment, the ruleset and the secret.
7. This design.
8. Settings, which are not files. The `amo-reviewer` environment: the owner as required reviewer, `main` only, administrator bypass off and checked, its three secrets, `REVIEWER_NOTES_SHA256`, and `BUN_SHA256` if set. No repository-level `REVIEWER_NOTES_SHA256` or `BUN_SHA256`, checked. The `main` ruleset: one approval, review from Code Owners, last-push approval, stale approvals dismissed, CI's `g28-proof` check required, no bypass but Repository admin, checked, and checked again before each stable release. And `vars.PUBLISH_AMO`.
9. The risks under "Owner caveats", accepted as they stand: the settings checked by hand, debug logging settled by the dry run, and `submit-amo`'s token and AMO keys readable on its runner until a `gh-release-upload` job takes the token.

`bunfig.toml`, `tests/setup/*.ts`, `tsconfig.json`, `scripts/run-bun-tests.ts`, `package.json`'s test scripts and the rest of `ci.yml`'s jobs are off the list. The proof runs in a job with no install, with an empty config and tsconfig and an environment holding only `PATH`, `HOME` and `RUNNER_TEMP`, and names the test file itself. The checkout and setup-bun before it are still on their tags. A moved tag there could fake the proof, so the owner must pin those two before turning the reviewer jobs on, and the pin test holds that.

The first proposal's list also had `package.json`'s dependencies, `bun.lock`, `amo-version.ts` and `check-signed-build.sh`, because they ran in `submit-amo` beside the login. They no longer share a job with it. `scripts/amo-metadata.ts` and the `store/notes/` templates write the notes the fill sends. A changed template can change what AMO receives, but not where the request goes. Until the third review the proof ran `amo-metadata.ts` itself. Its test now lives outside the proof, so the file stays off the list. A test catches the plain ways the proof could name it again, and the owner's review of the code-owned test file catches the rest. The owner may still add it and the templates.

## Turning it on, after approval

1. The owner pins the three actions in both reviewer jobs, and the checkout and setup-bun in `ci.yml`'s `g28-proof` job, to commits from the upstream tags, as "The two jobs" describes, replacing each `# TODO(owner, G28)`. The job test of `g28-proof` then expects the pinned `uses:` values.
2. The owner runs the dry run in a scratch repository, with the pins from step 1.
3. `amo-metadata.ts` lets the four test-account placeholders through a release build, in its own change.
4. The owner sets up `amo-reviewer` and the `main` ruleset as `releasing.md` describes, in order, and stores nothing until every check prints `true`. Storing the secret before step 5 is safe, because GitHub skips the jobs.
5. A commit deletes `false && ` from both jobs' `if` and changes the test "stay off until the owner approves G28" to expect each condition without it. The pin test then requires the SHAs from step 1, in the reviewer jobs and in `g28-proof`. The owner reviews and merges it like any other change to `main`.
6. After the first release that uses it, the owner checks the version's "Notes to Reviewer" on AMO once.
7. Before each stable release, the owner reruns `releasing.md` steps 2 and 3, as "Owner caveats" says.

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

## How the third review's findings were addressed

| # | Finding | Change | Evidence |
|---|---|---|---|
| B1a | A planted `fake-amo.tsx` that exits 0 made the step pass with no test run | The import names `./fixtures/fake-amo.ts`. CODEOWNERS covers `tests/integration/fixtures/**`. The step reads Bun's junit report and fails unless it counts 102 tests, 0 failures and 0 skipped | the import test, the CODEOWNERS test, 4 stand-in tests; `extensionless-import`, `planted-tsx`, `fixtures-unowned`, `fixture-file-owned`, `proof-counts-fewer`, and the control `planted-tsx-beside-full-name` |
| B1b | The proof ran `scripts/amo-metadata.ts`, which no one code-owns | The build half of that test moved to `tests/integration/amo-metadata-login.test.ts` in the full suite. The proof fills from a fixture's metadata. A test holds every `join(root, …)` path in the proof to the owner. `amo-metadata.ts` stays off the list and off CODEOWNERS | the paths test; `metadata-in-proof`, and the control row, which failed while the proof needed the file |
| H-a | The job-shape test compared parts | Each reviewer job's keys and values, each step's key set, the download inputs and the login step's env are compared whole. Workflow-level `defaults` fail. Both jobs run on `ubuntu-24.04` | `reviewer-latest-image`, `reviewer-container`, `reviewer-job-defaults`, `reviewer-step-shell`, `reviewer-step-continue`, `reviewer-step-env`, `workflow-defaults` |
| H-b | The reference scans were case-sensitive | They match without case | `upper-bulk-secrets`, `upper-job-token`, `lower-login-name` |
| H-c | The CODEOWNERS test anchored every pattern at the root | A matcher follows GitHub's rules, held by 16 documented examples | `owners-basename-later`, `owners-directory-later`, `old-owners-matcher` |
| H-d | Nothing showed a failing proof fails the step | The step has only a name and a `run:`, in a job without `continue-on-error` or `defaults`. Stand-ins that fail, run short, skip or exit early fail it. Its setup-bun has `no-cache: true`. The ruleset check requires the `build` status check | `proof-ignores-count`, `proof-or-true`, `proof-continue-on-error`, `proof-if`, `proof-job-continue-on-error`, `proof-cached-bun`, `ruleset-no-build-check` |
| H-e | Outside G28: `submit-amo`'s checkout kept its write token, so the comment calling the upload the only step with it was wrong | `persist-credentials: false`, and the comment says why the token stays out of the earlier steps. A test holds every checkout in a job that can write to it | `submit-amo-keeps-token`, `write-all-keeps-token` |
| H-f | The settings are checked once | Recorded under "Owner caveats", and "Turning it on" step 7 reruns `releasing.md` steps 2 and 3 before each stable release | owner step |
| H-g | Debug logging is unseen | The dry run's step 6 re-runs with debug logging | owner step |
| Nits | Runner, hang test and `releasing.md` | The runner has a control row and runs the real CI step; timeouts don't count as catches. The hang test has 30 seconds. The variable check uses `ascii_upcase` with `--paginate`, and the ruleset loop prints `false` when no ID comes back | `repo-digest-any-case`, `ruleset-loop-silent`; `no-timeout` caught by assertion, not by timeout |

## How the fourth review's findings were addressed

| # | Finding | Change | Evidence |
|---|---|---|---|
| 1 | A workflow-level `env` such as `BUN_OPTIONS=--preload=…`, or a step before checkout writing `$GITHUB_ENV`, could fake the proof. The review made a preload write a passing 102-test junit report and exit 0 | A test compares `ci.yml`'s top-level keys whole, with no `env`. The proof's job is compared whole: checkout, setup-bun, the proof. Bun runs under `env -u BUN_OPTIONS -u NODE_OPTIONS`. Approval item 4 names the top-level keys | the top-level keys, job and `BUN_OPTIONS` preload tests; `ci-workflow-env`, `proof-job-env`, `proof-step-writes-env`, `proof-keeps-bun-options` |
| 2 | The paths guard saw only the literal `join(root, "…")`, so `join(root, "scripts", …)`, `resolve(root, …)` and `${root}/…` passed | Every line naming `root` must be its declaration, a stat-only helper, or `join(root, "<one literal path>")` with no `.` or `..` part | the test of this file's paths; `root-two-parts`, `root-resolve`, `root-template`, `root-dot-dot`, `root-alias`, `root-helper-reads` |
| 3 | The CODEOWNERS matcher read `!`, `[ ]` and `{a,b}`, which GitHub ignores, and its wildcard-directory rule might differ from GitHub's | Only `/path` and `/path/**` lines with `@logins` are read, and a test fails any other line. A directory is owned only when the last line covering it and every line inside it name the owner | the form test, 10 unread lines, 9 examples; `owners-brace`, `owners-bracket`, `owners-negation`, `owners-wildcard-directory`, `owners-inner-later`, `owners-directory-reowned`, `owners-prefix-match`, `owners-directory-self` |
| 4 | The required `build` check was ambiguous: `release.yml` and `pages.yml` also have a dispatchable `build` job | The proof runs in `ci.yml`'s `g28-proof` job, whose name no other job uses or computes. The documented ruleset and its check require `g28-proof` | the job, check-name and ruleset tests; `proof-name-reused`, `proof-name-computed`, `ruleset-no-proof-check`, `ruleset-build-check` |
| 5 | `submit-amo`'s token and AMO keys are readable in memory through `sudo` on hosted runners | Recorded under "Owner caveats" with the proposed `gh-release-upload` job, and added to the approval as item 9 | owner decision |
| Nit | `releasing.md`'s ruleset loop didn't split IDs in zsh | `printf \| while read -r`, which runs the same in zsh and bash, and `false` for a ruleset `gh` can't read | the ruleset-block test in three shells; `ruleset-loop-split`, `ruleset-loop-gh-silent` |

## How the fifth review's findings were addressed

| # | Finding | Change | Evidence |
|---|---|---|---|
| 1 | Bun 1.4.3 reads `BUN_INSPECT_PRELOAD` under `--config`, so the deny-list `env -u BUN_OPTIONS -u NODE_OPTIONS` let a checkout or setup-bun on a moved tag fake the proof through `$GITHUB_ENV` | Bun starts under `env -i` with `PATH`, `HOME` and `RUNNER_TEMP` only. Pinning `g28-proof`'s checkout and setup-bun is required, and the pin test keeps both reviewer jobs off while either is on its tag, and both carry `# TODO(owner, G28)` | the preload test with `BUN_INSPECT_PRELOAD`, a new environment test, the job and pin tests; `proof-keeps-environment`, `proof-deny-list`, `proof-passes-inspect-preload`, `proof-deny-list-any-bun`, `g28-proof-unpinned-gate-open` |
| 2 | The paths guard, named "reads or runs only files the approval covers", missed `join(root, …) + "/../…"`, a nested join, `resolve(import.meta.dir, …)` and paths relative to the working directory | The test is renamed to say it names the repository's top only to stat a path or to join one literal, code-owned path. Its comment and this design say it catches only the literal forms it knows, and that the owner's review of the code-owned file is the boundary. It doesn't try to catch every form | the renamed test; the path rows, unchanged |

## Review history

1. The first review (`ci-reviewer-credentials-review-1.md`) moved the secret out of `submit-amo` into two jobs of their own.
2. The second review (`ci-reviewer-credentials-review-2.md`) hardened the launchers, the gates, the environment checks and the proof's config.
3. The third review moved the proof off files no one code-owns and made the step count its tests.
4. The fourth review closed the workflow-level `env` route, gave the proof its own `g28-proof` check, and narrowed CODEOWNERS to the forms GitHub and the test read alike.
5. The fifth review found the `BUN_INSPECT_PRELOAD` route and the paths guard's overclaim. The owner approved closing G28's review rounds with the fixes above and no further review. What remains is the owner's approval of the files at one commit, under "What the owner approves", and the steps under "Turning it on".
