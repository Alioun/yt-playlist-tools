# G28: the reviewer test account in CI

Status: **proposal, not approved.** Both workflow steps that read the secret are `if: false`. Nothing here has run against a real secret.

## Goal

AMO's reviewers need a working Google account to try 2.0 (REL-STORE-21, REL-STORE-24, REL-STORE-25). The full and hotfix reviewer notes end with a test-account line that has four placeholders:

> {email} / {password}, with backup codes {code1}, {code2} for Google's sign-in check.

The owner decided (G28) that CI fills them now, from the `amo` environment secret `AMO_REVIEWER_LOGIN` (REL-CI-46). The value must reach AMO's reviewer notes and nothing else. It must stay out of logs, artifacts, the GitHub release, the sources zip, and the committed notes.

Chrome needs nothing. The dashboard's test instructions (§11) tell the reviewer to use any Google account with a YouTube channel, and no CWS step needs a reviewer account.

## The secret

**Name.** `AMO_REVIEWER_LOGIN`, an environment secret of the `amo` environment, as REL-STORE-24 and REL-CI-46 name it. It is not a repository secret.

**Format.** Four lines, in this order, with nothing else:

1. the account's e-mail address, with no whitespace (`x@y.z`);
2. the password, not empty, with no leading or trailing space (Google forbids both);
3. a backup code, 8 digits, written `12345678` or `1234 5678`;
4. a second backup code, different from the first.

One trailing newline is allowed, and so are Windows line endings. Anything else fails the check with a fixed line that names the bad line by number.

Four plain lines beat JSON here. Nothing needs escaping, whatever the password holds, the GitHub form takes a paste, and `op read` prints one value per line. As I recall the actions/runner source, the runner also masks each line of a multi-line secret, so each part would get its own mask. That is unverified here, and nothing relies on it.

**Creating it without echoing it.** The owner pastes the four lines into Settings › Environments › amo › Add environment secret. The alternative is a pipe from 1Password with all output discarded, which `docs/development/releasing.md` gives in full:

```sh
(set -o pipefail
 { op read "op://<vault>/<item>/username"
   op read "op://<vault>/<item>/password"
   op read "op://<vault>/<item>/<backup code field 1>"
   op read "op://<vault>/<item>/<backup code field 2>"
 } | gh secret set AMO_REVIEWER_LOGIN --env amo --repo Alioun/yt-playlist-tools) >/dev/null 2>&1 && echo set || echo failed
```

The value travels through a pipe, never argv, and the command prints `set` or `failed`. After a submission that used the codes, the same command stores two fresh ones (REL-CHK-24). Under the owner's rules this becomes a wizard stage once approved. This proposal doesn't write that wizard, because a wizard that runs `op read` is secret-handling code of its own and needs the same approval.

## How the value gets to AMO

`scripts/amo-reviewer-notes.ts` is the only code that reads the value. It imports only `node:crypto` and `node:fs`, writes no file, spawns nothing, and prints exactly one fixed line per run. It has two commands.

- `check <metadata file>` reads the build's `amo-metadata.json`. If its `approval_notes` has no placeholders (the beta template) it prints `skipped` and never reads the secret. If it has all four, it parses `AMO_REVIEWER_LOGIN` and prints `ready`. No network.
- `fill <version> <metadata file>` does the same checks, fills the four placeholders in one pass, and sends one `PATCH /api/v5/addons/addon/<GUID>/versions/v<version>/` with `{"approval_notes": <filled notes>}` and a JWT. It then compares AMO's answer with what it sent.

The one-pass fill matters. A password containing `{code1}` or `$&` goes in literally, and a test proves it.

### Step by step, and where the value is at each step

| # | Where | What holds the value | For how long |
|---|---|---|---|
| 1 | GitHub's encrypted secret store, `amo` environment | the secret | until the owner replaces or deletes it |
| 2 | `submit-amo` starts after the owner approves the `amo` deployment. GitHub hands the job's secrets to the runner, which registers each line with its log masker. | the runner process | the job (an ephemeral VM, destroyed after it) |
| 3 | "Check the reviewer test account" (`release.yml:202`), before "Is this version already on AMO?" and any submit | the step's own `env`, so its `bash` and the one `bun` it starts | about a second |
| 4 | `bun amo-reviewer-notes.ts check` | the parsed login in memory | until that process exits |
| 5 | "Is this version already on AMO?", "Submit to AMO (listed)", "Attach the missing sources", "Check AMO has the version with its sources" | nothing. `AMO_REVIEWER_LOGIN` is in no other step's env and in no job-level env | |
| 6 | "Put the reviewer test account into the reviewer notes" (`release.yml:275`), after AMO confirms the version and its sources | the step's `env`, its `bash` and its one `bun` | one to three seconds |
| 7 | `bun amo-reviewer-notes.ts fill` | the login and the filled notes in memory, then the TLS request body to `addons.mozilla.org` | until that process exits |
| 8 | AMO | the version's `approval_notes`, which AMO shows to its reviewers and the add-on's authors | until the notes are replaced |

Both steps first copy the script to `$RUNNER_TEMP`, check its SHA-256 against `REVIEWER_NOTES_SHA256` (`release.yml:182`), and run that copy from `$RUNNER_TEMP` with `bun --no-env-file`. So Bun loads no `bunfig.toml` (which could preload code), no `tsconfig.json` and no `.env` from the checkout. A copy whose digest differs never runs.

The version reaches AMO with the placeholders first, because `wxt submit` uploads the build's `dist/amo-metadata.json`. The fill follows seconds later. If the fill fails, the version shows the placeholders until **Re-run failed jobs**. The re-run finds the version `present`, skips the submit, and sends the notes again. The PATCH is idempotent.

## Why not hand the filled file to `wxt submit`

The brief expected the filled notes to go through `scripts/amo-metadata.ts` and `wxt submit`. That design lost for three reasons.

- **`wxt submit` prints AMO's raw error body.** publish-browser-extension 6.1.1 (the locked version) throws `Fetch request failed with code ${res.status} ${res.statusText}: ${await res.text()}` on any non-2xx answer (`dist/init-DhMr270n.mjs:104`). No one can prove AMO never quotes a rejected field back, so a failed upload could print the password. The owner's rule keeps upstream output inside the handler on every path. That is achievable only in code we own.
- **It needs a file.** The filled notes would sit on the runner's disk while third-party code reads them. With the PATCH they exist only in one process's memory.
- **`amo-metadata.ts` runs in the `build` job,** which has no `amo` environment and must never get the secret. Its output goes into the `release-<version>` artifact.

The cost of the chosen design is the window of seconds described above, plus a second copy of the 6-line JWT helper from `scripts/amo-version.ts`. The copy is deliberate. It keeps the approved code to one file that imports nothing from the checkout.

## How each output stays free of the value

- **Logs.** The script prints one line built from constants, line numbers, counts, the version, placeholder names and an HTTP status. The `run:` blocks never mention `AMO_REVIEWER_LOGIN`, so the shell never expands it into a command line. The tests run both real `run:` blocks under `bash -x` and find no part of the login in stdout or in the trace. The runner's masking stays a backstop and is not the boundary.
- **Argv of every spawned process.** The value arrives through the step's env only. The `bash -x` trace in the tests shows the expanded argv of every command each step spawns (`cp`, `shasum`, `bun`), and none holds any part. The script itself has no way to spawn. Its imports are `node:crypto` and `node:fs` only, it never touches `Bun.`, and a test pins both.
- **Artifacts.** The only artifact, `release-<version>`, comes from the `build` job, which can't read `amo` secrets. A test runs the real `amo-metadata.ts` with `AMO_REVIEWER_LOGIN` set in its environment and finds only the placeholders in the file it writes. `submit-amo` uploads no artifact.
- **The GitHub release.** `github-release` can't read `amo` secrets and uploads `dist/*.zip dist/manifest.*.json` (`release.yml:157`). `submit-amo` adds only `signed/*.xpi` for a beta (`release.yml:307`), whose notes have no placeholders and which holds no metadata.
- **The sources zip.** The `build` job makes it from the repository, which holds only placeholders (REL-STORE-24).
- **The committed notes.** `store/notes/reviewer-*.md` hold the placeholders. No job writes back to the repository.
- **The uploaded metadata.** `wxt submit` and `web-ext sign` upload `dist/amo-metadata.json` with the placeholders. The filled notes go only in the PATCH body to AMO. A test checks that `dist/amo-metadata.json` is byte-identical after the fill.
- **Files on the runner.** The script writes none. Bun writes its transpiler cache under `$HOME`, and that cache holds transpiled source, not runtime values. The end-to-end test sets `HOME` to the workspace and scans every file left behind, the cache included.

## Failure paths

Every line goes to stdout, where GitHub turns `::error::` into an annotation. None quotes the login, the notes, AMO's answer or an exception message.

| Situation | Step | Prints | Exit | State on AMO | The owner then |
|---|---|---|---|---|---|
| The notes ask for no account (beta) | both | `reviewer-notes: skipped (the notes have no test-account placeholders)` | 0 | unchanged | nothing |
| All good | check | `reviewer-notes: ready` | 0 | nothing submitted yet | nothing |
| All good, AMO echoes the notes | fill | `reviewer-notes: filled (AMO version 2.0.0, confirmed)` | 0 | filled | nothing |
| All good, AMO's answer omits the notes | fill | `reviewer-notes: filled (AMO version 2.0.0; its answer does not show the notes)` | 0 | filled, unconfirmed | checks the Developer Hub once (see Unverified) |
| Secret not set or empty | check | `::error::reviewer-notes: login-missing (AMO_REVIEWER_LOGIN is not set)` | 1 | nothing submitted | sets it, then Re-run failed jobs |
| Wrong number of lines | check | `::error::reviewer-notes: login-malformed (expected 4 lines, got N)` | 1 | nothing submitted | fixes it, re-runs |
| Bad line | check | `login-malformed (line 1 is not an e-mail address)`, `(line 2 is empty or padded)`, `(line 3 is not an 8-digit backup code)`, `(line 4 is not an 8-digit backup code)` or `(lines 3 and 4 are the same code)`, each after `::error::reviewer-notes: ` | 1 | nothing submitted | fixes it, re-runs |
| Template has some placeholders, not all | check | `::error::reviewer-notes: template-incomplete (the notes lack {code1}, {code2})` | 1 | nothing submitted | fixes `store/notes/`, which needs a new release commit because the notes travel in the artifact |
| Metadata missing, not JSON, or notes not text | check | `::error::reviewer-notes: notes-unreadable (the metadata file is missing, not JSON, or its approval_notes is not text)` | 1 | nothing submitted | looks at the build job |
| Script differs from the pin | both | `::error::amo-reviewer-notes.ts is not the approved version (G28)` | 1 | nothing submitted if at check | re-approves, then updates the pin |
| AMO keys missing | fill | `::error::reviewer-notes: amo-keys-missing (FIREFOX_EXTENSION_ID, FIREFOX_JWT_ISSUER and FIREFOX_JWT_SECRET must be set)` | 1 | placeholders | can't occur after the earlier steps, which need the same keys |
| AMO answers non-2xx | fill | `::error::reviewer-notes: upload-failed (AMO answered 400)` (the status only, body discarded) | 1 | placeholders | Re-run failed jobs |
| No answer (network, TLS) | fill | `::error::reviewer-notes: upload-failed (no answer from AMO)` | 1 | placeholders | Re-run failed jobs |
| AMO answers with different notes | fill | `::error::reviewer-notes: upload-unconfirmed (AMO kept different notes)` | 1 | unknown | checks the Developer Hub |
| Anything unexpected | both | `::error::reviewer-notes: internal-error` | 1 | placeholders at worst | reproduces locally with dummy values |
| Bad arguments | both | `usage: …` on stderr | 2 | nothing | fixes the workflow |

## Tests (credential-free)

`tests/integration/amo-reviewer-notes.test.ts`, 33 tests. They run in `bun run test:bun` through the `./tests` entry.

- Every value is a fake. The password is `dummy-reviewer-password-0000"\$&{code1}`, which carries JSON escapes, a `$&` replacement pattern and a placeholder. The codes are `0000 1111` and `2222 3333`, and the JWT pair is `dummy-jwt-issuer-0000` and `dummy-jwt-secret-0000`.
- Each child process gets an environment built from scratch, so a real secret in the shell that runs the tests can't reach it. Dummies go through env, never argv. No test name contains a value. A failing leak check names the leaked field, never its value.
- The step tests take both `run:` blocks from `release.yml` as written and run them under `bash -e -x` in a temporary runner workspace. A `bun` shim on `PATH` preloads `tests/integration/fixtures/fake-amo.ts`, which replaces `fetch`. The fake records each request and answers in seven ways, and its failures quote the request back, the worst AMO could do.
- What they prove: the value reaches the PATCH body exactly as the template says, once, signed with a JWT that verifies. It is absent from stdout, stderr, the `bash -x` trace (every spawned argv), every exception path, the build's metadata file, and every file left in the workspace and `HOME`. Each failure path prints its fixed line and exit code, and nothing reaches AMO before the login is valid. They also pin the workflow's shape. The secret appears in exactly two step-level `env` blocks, the `run:` blocks never name it, both steps are `if: false`, the check runs before any submit and the fill after AMO has the version, and `REVIEWER_NOTES_SHA256` matches the script.

Mutation runs confirm the tests catch real leaks. Nine scratch edits each failed the suite and were then restored: printing AMO's error body, printing a caught exception, echoing a malformed e-mail, removing the catch-all, filling with sequential string replaces, sending the template unfilled, passing the login as an argument, moving the secret to job-level env, and enabling a step. Each edit re-pinned the digest first, so the pin check didn't mask the result.

## Unverified, to settle on the first approved run

- **AMO accepts `approval_notes` on the version edit endpoint.** This comes from AMO's v5 API docs as I recall them; this session had no network. The endpoint and its JWT already work for `source` (`scripts/amo-version.ts attach-source`) and `compatibility` (publish-browser-extension). If AMO ignored the field and also left it out of its answer, the script would print `filled (…; its answer does not show the notes)` and exit 0. So after the first approved release, the owner looks once at the version's "Notes to Reviewer" in the Developer Hub.
- **Whether AMO's answer includes `approval_notes`.** The script handles both cases and says which one happened.
- **That the runner masks each line of a multi-line secret.** This is from memory of the actions/runner source. Nothing in the design relies on it.

## Findings outside this change

- `release.yml:250` passes `--api-secret "$FIREFOX_JWT_SECRET"` to `web-ext sign` on its command line, which the owner's rules forbid for a secret. web-ext reads its options from `WEB_EXT_`-prefixed environment variables, so `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` in the step's env would remove it from argv. This needs its own change and approval; this proposal doesn't touch it.
- `scripts/amo-version.ts` prints AMO's raw body when a request fails. Its requests never carry the login. After a fill, though, AMO's answer to its `status` lookup may contain the filled notes, and on success it prints only `missing`, `no-source` or `present`.

## What the owner approves

The owner's rules require three things before this runs: these credential-free behavior tests, a separate agent review of the secret flow, and the owner's approval. The tests are done and pass. **The review has not run**, because this task's brief said to run none. The approval covers the exact files below and holds only for these versions. A change to any of them needs all three again.

1. `scripts/amo-reviewer-notes.ts`, SHA-256 `46372e7ff86b8b5eb647c8fc616ec32167ac341848aae2d5fa4416eaa525ee06`. It is the only code that reads the value, and the workflow pins it.
2. `.github/workflows/release.yml`, the `submit-amo` job as a whole. It decides which steps get the secret, in what order, the pin, and the run lines.
3. `package.json`'s `packageManager` (`bun@1.4.3`), through `oven-sh/setup-bun@v2`, the runtime that executes the script.
4. `scripts/amo-version.ts`, because AMO's answers to it may contain the filled notes after a fill.
5. `tests/integration/amo-reviewer-notes.test.ts` and `tests/integration/fixtures/fake-amo.ts`, the evidence the approval rests on.
6. `docs/development/releasing.md`, the "reviewer test account" section, the owner's procedure for storing and refreshing the secret.
7. This design, `.audit/2.0-build/ci-reviewer-credentials-design.md`.
8. The `amo` environment's settings, which are not a file. The owner stays the required reviewer, and the design asks for **Deployment branches** to allow only `main`, as `amo-dev` already allows only `dev`.

The frozen copy is `main`. Changes reach it only through a PR that passes CI (REL-CI-49), merged by the owner or on the owner's explicit instruction. Agents can't push to it. Each run then checks the script's digest before running a copy that loads nothing else from the checkout.

`scripts/amo-metadata.ts` and the `store/notes/` templates feed the script but never see the value. The end-to-end test covers `amo-metadata.ts`. The owner may add them to the list.

## Turning it on, after approval

1. The owner sets `amo`'s Deployment branches to `main` only.
2. The owner stores `AMO_REVIEWER_LOGIN` as above.
3. A commit deletes the two `if: false` lines and updates the test "both steps stay off until the owner approves G28". The owner reviews and merges it like any other change to `main`.
4. After the first release that uses it, the owner checks the version's "Notes to Reviewer" on AMO once.
