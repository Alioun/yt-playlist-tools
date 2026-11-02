# Releasing

[← Development](README.md)

`main` is what's released ([ADR-0014](../adr/0014-dev-integrates-main-releases-on-a-version-bump.md)). Every push to `main` runs [`release.yml`](../../.github/workflows/release.yml), and [`release-meta.sh`](../../scripts/release-meta.sh) decides from the tags alone whether that push releases:

- `package.json`'s version is `MAJOR.MINOR.PATCH`, numbers only;
- `v{version}` isn't tagged yet, and the version is above the highest tag;
- the first release is `1.99.1`, the first 2.0 beta. 1.5.0 never ships.

A merge that doesn't bump the version releases nothing. A version below the last release, or a malformed one, fails the run.

[RELEASING.md](../../RELEASING.md) is the checklist to tick off around each release.

## Releasing a version

1. On `dev`, bump `version` in `package.json` and write `store/release-notes/{version}.md`. A patch also needs `store/notes/hotfix/{version}.md`, the one sentence that opens its reviewer notes. [`amo-metadata.ts`](../../scripts/amo-metadata.ts) builds AMO's metadata from these and from the reviewer templates in `store/notes/`: `reviewer-full.md` for major and minor releases, `reviewer-hotfix.md` for patches and `reviewer-beta.md` for betas. It drops their `<!-- -->` comments, fills `{version}`, `{next release}`, `{previous version}` and `{fix}`, and fails a release build if a file is missing or a placeholder is left. The one exception is the reviewer test account's `{email}`, `{password}`, `{code1}` and `{code2}` in the full and hotfix templates. A later, owner-gated step fills those (G28), so `amo-metadata.ts` leaves them in place and only lists them.
2. Open a PR from `dev` to `main`, and merge it with a **merge commit**, not a squash, so the two branches don't diverge.
3. `release.yml`:
   1. builds and checks both packages (typecheck, tests, manifests, and the sources zip rebuilding);
   2. tags `v{version}` and creates the GitHub release with the zips, the manifests and the release notes as its text. Betas get a pre-release;
   3. waits for your approval in the `amo` and `cws` environments, then submits exactly the files it checked. Once G28 is on, a stable release also waits for `amo-reviewer` twice: before `submit-amo` and after it.
4. Approve each store in the run, or reject one to hold it.
5. The run's last job starts [`pages.yml`](../../.github/workflows/pages.yml), which rebuilds the site and its `beta/updates.json`.

The channel comes from the version:

| Version | Channel | AMO | Chrome Web Store |
| --- | --- | --- | --- |
| `1.99.N` (2.0's betas) | beta | signed **unlisted**; the `.xpi` is attached to the pre-release | the main item, Unlisted |
| `X.Y.9NN` (later betas) | beta | signed unlisted | not submitted |
| anything else | stable | **listed** | submitted; `CWS_PUBLISH_TYPE`, or always `DEFAULT_PUBLISH` for a patch |

## The site and beta updates

[`pages.yml`](../../.github/workflows/pages.yml) deploys `site/` to https://alioun.github.io/yt-playlist-tools/. It runs on pushes to `main` that touch the site, on a published release, on dispatch, and when a release run asks for it. [`build-site.ts`](../../scripts/build-site.ts) builds the folder it deploys. It reads the GitHub releases and writes `beta/updates.json` with every pre-release's signed `.xpi` and its `sha256`, then the newest release's AMO-signed `.xpi` as the hand-off. It also fills the `/beta/` page's download link, keeps the home page's beta notice only while a beta is the newest release, and dates the privacy policy from v1.99.1. `updates.json` is never committed.

To preview the site, run `bun scripts/build-site.ts --out _site --offline` and open `_site/index.html`.

To check a release without publishing, run the workflow by hand (**Actions › Release › Run workflow**). A dispatch is a dry run: it decides and builds, and never tags or submits. Missing notes are only a warning there.

## Retrying and holding

- **Hold a store:** reject its environment in the run.
- **Resume:** use **Re-run failed jobs**. It keeps `meta`'s and `build`'s outputs and the checked artifact, and every job picks up where it stopped:
  - `github-release` finishes a release that's already there, if its tag is this commit;
  - `submit-amo` uploads only a version AMO doesn't have, attaches the sources if they're missing, and for a beta fetches the signed file;
  - `fill-reviewer-notes`, once G28 is on, sets the reviewer notes again;
  - `submit-cws` skips a version that's already submitted or published.
- **Re-run all jobs** isn't a recovery path: `meta` would see the tag and skip everything.

## Hotfixes

Cut `hotfix/X.Y.Z` from the last release tag, bump the patch version, and open its PR against `main`. Merging it releases. Then merge `main` back into `dev`.

## GitHub setup

Once, in the repository settings:

- **Environments** `amo` and `cws`, each with you as required reviewer and self-review allowed.
  - `amo`: the secrets `FIREFOX_JWT_ISSUER` and `FIREFOX_JWT_SECRET`, from addons.mozilla.org › Tools › Manage API Keys. The add-on's GUID and slug are in the workflow.
  - `amo-dev`: the same two secrets, for [signed Firefox dev builds](testing-and-ci.md#installing-a-dev-build). No required reviewer, so every push to `dev` signs unattended. Under **Deployment branches**, allow only `dev`, so no other branch can read the key.
  - `cws`: the secrets `CHROME_PUBLISHER_ID`, `CHROME_EXTENSION_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` and `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`. Store the PEM with real newlines.
- **Repo variables:**
  - `PUBLISH_AMO`, `true` to submit to AMO.
  - `PUBLISH_CWS`, `true` to submit to the Chrome Web Store. It stays `false` until the item exists: the API can't create one, so `v1.99.1`'s Chrome zip is uploaded by hand, as Unlisted, from the run's artifacts.
  - `CWS_PUBLISH_TYPE`, `DEFAULT_PUBLISH` or `STAGED_PUBLISH`.
  - `SIGN_DEV_BUILDS`, `true` to sign the Firefox dev build on every push to `dev`.
- **A ruleset on `main`:** pull requests required, with at least one approval, review from Code Owners ([`.github/CODEOWNERS`](../../.github/CODEOWNERS)), approval of the most recent push, and stale approvals dismissed; the CI `build` check required; no force pushes; nothing in the bypass list but **Repository admin**. GitHub doesn't let a pull request's author approve it. The reviewer test account's setup below checks this.
- Before setting `PUBLISH_AMO`, check that the API key works: run `bun scripts/amo-version.ts status 1.4.5` with `FIREFOX_EXTENSION_ID` set to the GUID (with braces) and the JWT pair. It should print `present` or `no-source`; an error means the key is wrong.

### The reviewer test account (proposed, off until approved)

AMO's full and hotfix reviewer notes carry `{email}`, `{password}`, `{code1}` and `{code2}` (REL-STORE-21, REL-STORE-25). Under decision G28, two jobs in `release.yml` fill them from the secret `AMO_REVIEWER_LOGIN`. `check-reviewer-login` checks it before `submit-amo` sends anything, and `fill-reviewer-notes` puts it into the version's notes once AMO has the version. Both run only for stable releases, in the `amo-reviewer` environment, which no other job uses. Both stay `if: false && …` until the owner approves [the design](../../.audit/2.0-build/ci-reviewer-credentials-design.md), its tests, and a separate review of the secret flow.

Set it up in this order. Store nothing until every check in steps 2 and 3 prints `true`.

1. Under **Settings › Environments**, create `amo-reviewer`:
   - you as required reviewer, self-review allowed;
   - under **Deployment branches and tags**, **Selected branches and tags** with the one rule `main`, a branch;
   - **Allow administrators to bypass configured protection rules** turned off.
2. Check that only `main` can deploy to `amo-reviewer`, that you review it, that no administrator can skip your review, and that no repository variable stands in for the environment's digests, which `vars.` would read if the environment lacked them. GitHub reads variable names in any case. Each command prints `true` or `false`, and the last one line per page of variables:

   ```sh
   gh api repos/Alioun/yt-playlist-tools/environments/amo-reviewer --jq '.can_admins_bypass == false and .deployment_branch_policy == {"protected_branches": false, "custom_branch_policies": true} and [.protection_rules[] | select(.type == "required_reviewers") | .reviewers[].reviewer.login] == ["Alioun"]'
   gh api repos/Alioun/yt-playlist-tools/environments/amo-reviewer/deployment-branch-policies --jq '[.branch_policies[] | {name, type}] == [{"name": "main", "type": "branch"}]'
   gh api repos/Alioun/yt-playlist-tools/actions/variables --jq 'all(.variables[]; (.name | ascii_upcase) as $name | $name != "REVIEWER_NOTES_SHA256" and $name != "BUN_SHA256")' --paginate
   ```

3. Set up the `main` ruleset so that nothing reaches `main` without your review of its last push. Under **Settings › Rules › Rulesets**, its **Require a pull request before merging** needs at least one approval, **Dismiss stale pull request approvals when new commits are pushed**, **Require review from Code Owners** and **Require approval of the most recent reviewable push**. Its **Require status checks to pass** lists CI's `build` check, which runs the G28 tests. Its bypass list holds **Repository admin**, which here is you alone, or nothing: no GitHub App, deploy key or other role. Without last-push approval, a commit pushed after your approval would merge without your review, and an agent could merge it. Then check it. The first command prints `true` or `false`, and the loop prints one such line for each ruleset on `main`, or `false` when it finds none:

   ```sh
   gh api repos/Alioun/yt-playlist-tools/rules/branches/main --jq 'any(.[]; .type == "pull_request" and .parameters.required_approving_review_count >= 1 and .parameters.dismiss_stale_reviews_on_push == true and .parameters.require_code_owner_review == true and .parameters.require_last_push_approval == true) and any(.[]; .type == "required_status_checks" and any(.parameters.required_status_checks[]; .context == "build"))'
   ids=$(gh api repos/Alioun/yt-playlist-tools/rules/branches/main --jq '[.[].ruleset_id] | unique | .[]')
   [ -n "$ids" ] || echo false
   for id in $ids; do
     gh api "repos/Alioun/yt-playlist-tools/rulesets/$id" --jq '.enforcement == "active" and (.bypass_actors | type == "array") and all(.bypass_actors[]; .actor_type == "RepositoryRole" and .actor_id == 5)'
   done
   ```

4. Store the variable `REVIEWER_NOTES_SHA256`, the SHA-256 of `scripts/amo-reviewer-notes.ts` at the commit you approved. The jobs run the script only at this digest, so a changed script waits for your approval again. The digest isn't secret:

   ```sh
   (set -euo pipefail
    digest=$(git show <approved commit>:scripts/amo-reviewer-notes.ts | shasum -a 256 | cut -d ' ' -f 1)
    gh variable set REVIEWER_NOTES_SHA256 --env amo-reviewer --repo Alioun/yt-playlist-tools --body "$digest")
   ```

   A failed `git show` stops it before `gh` starts. Without `pipefail`, `shasum` would hash the empty output, and the variable would hold the digest of nothing.
5. Optionally, store the variable `BUN_SHA256`, the SHA-256 of the `bun` binary that `oven-sh/setup-bun` installs for Bun 1.4.3 on `ubuntu-latest`. The jobs then run only that binary, and refuse to start if it differs. Take it from the release's `bun-linux-x64.zip`, after checking the zip against the release's signed `SHASUMS256.txt.asc`: `unzip -p bun-linux-x64.zip bun-linux-x64/bun | shasum -a 256`. Without it, the jobs skip that check.
6. Store the secrets `FIREFOX_JWT_ISSUER` and `FIREFOX_JWT_SECRET`, the same values as in `amo`.
7. Store `AMO_REVIEWER_LOGIN`, as below.

`AMO_REVIEWER_LOGIN` is four lines, in this order, with nothing else:

1. the reviewer account's e-mail address;
2. its password, with no leading or trailing space;
3. one unused backup code, 8 digits, as `12345678` or `1234 5678`;
4. a second, different unused backup code.

Store it without echoing any of it. One way is to paste the four lines into **Settings › Environments › amo-reviewer › Add environment secret**. The other is from 1Password:

```sh
(set -euo pipefail
 login=$(op read "op://<vault>/<item>/username" &&
   op read "op://<vault>/<item>/password" &&
   op read "op://<vault>/<item>/<backup code field 1>" &&
   op read "op://<vault>/<item>/<backup code field 2>")
 printf '%s\n' "$login" | gh secret set AMO_REVIEWER_LOGIN --env amo-reviewer --repo Alioun/yt-playlist-tools) >/dev/null 2>&1 && echo set || echo failed
```

`op read` ends each value with a newline, so `login` holds four lines. All four reads finish before `gh` starts, so a failed read stores nothing and the command prints `failed`. A pipe straight from the reads into `gh secret set` would store whatever lines arrived before the failure. After a submission whose codes were used, the same command stores two fresh codes (REL-CHK-24). `gh secret list --env amo-reviewer` shows only names and dates. `check-reviewer-login` checks the format before anything is submitted, and prints only a fixed line.

Each stable release then asks you to approve `amo-reviewer` twice: for the check before `submit-amo`, and for the fill after it. Betas ask for neither.

## Publishing by hand

Fill in `.env.submit` (or run `bunx wxt submit init`), then build the zips and the AMO metadata it points at, and submit:

```bash
bun run zip && bun run zip:firefox
bun scripts/amo-metadata.ts --version <version> --kind <major|minor|patch> --channel stable --previous <last release> --out .output/amo-metadata.json --strict
bunx wxt submit --firefox-zip .output/*-firefox.zip --firefox-sources-zip .output/*-sources.zip
```

For the Chrome Web Store, prefer `bun scripts/cws-submit.ts .output/*-chrome.zip <version>` with the `CHROME_*` variables set: `wxt submit` fails an upload the store is still processing. See [Environment files](environment-files.md).
