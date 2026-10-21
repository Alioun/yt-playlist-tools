# Releasing

[← Development](README.md)

`main` is what's released ([ADR-0014](../adr/0014-dev-integrates-main-releases-on-a-version-bump.md)). Every push to `main` runs [`release.yml`](../../.github/workflows/release.yml), and [`release-meta.sh`](../../scripts/release-meta.sh) decides from the tags alone whether that push releases:

- `package.json`'s version is `MAJOR.MINOR.PATCH`, numbers only;
- `v{version}` isn't tagged yet, and the version is above the highest tag;
- the first release is `1.99.1`, the first 2.0 beta. 1.5.0 never ships.

A merge that doesn't bump the version releases nothing. A version below the last release, or a malformed one, fails the run.

## Releasing a version

1. On `dev`, bump `version` in `package.json` and write `store/release-notes/{version}.md`. For AMO, also make sure the reviewer notes exist: `store/notes/reviewer-full.md`, `reviewer-hotfix.md` (patches) or `reviewer-beta.md` (betas). A release build fails without them.
2. Open a PR from `dev` to `main`, and merge it with a **merge commit**, not a squash, so the two branches don't diverge.
3. `release.yml`:
   1. builds and checks both packages (typecheck, tests, manifests, and the sources zip rebuilding);
   2. tags `v{version}` and creates the GitHub release with the zips and manifests. Betas get a pre-release;
   3. waits for your approval in the `amo` and `cws` environments, then submits exactly the files it checked.
4. Approve each store in the run, or reject one to hold it.

The channel comes from the version:

| Version | Channel | AMO | Chrome Web Store |
| --- | --- | --- | --- |
| `1.99.N` (2.0's betas) | beta | signed **unlisted**; the `.xpi` is attached to the pre-release | the main item, Unlisted |
| `X.Y.9NN` (later betas) | beta | signed unlisted | not submitted |
| anything else | stable | **listed** | submitted; `CWS_PUBLISH_TYPE`, or always `DEFAULT_PUBLISH` for a patch |

Until `pages.yml` serves `beta/updates.json`, beta testers get no automatic updates: they install each beta by hand from its pre-release.

To check a release without publishing, run the workflow by hand (**Actions › Release › Run workflow**). A dispatch is a dry run: it decides and builds, and never tags or submits. Missing notes are only a warning there.

## Retrying and holding

- **Hold a store:** reject its environment in the run.
- **Resume:** use **Re-run failed jobs**. It keeps `meta`'s and `build`'s outputs and the checked artifact. `submit-amo` first asks AMO whether the version is already there. If it is, it skips the upload, and for a beta fetches the signed file instead. The Chrome Web Store rejects a version it already has, so a re-run there fails harmlessly.
- **Re-run all jobs** isn't a recovery path: `meta` would see the tag and skip everything.

## Hotfixes

Cut `hotfix/X.Y.Z` from the last release tag, bump the patch version, and open its PR against `main`. Merging it releases. Then merge `main` back into `dev`.

## GitHub setup

Once, in the repository settings:

- **Environments** `amo` and `cws`, each with you as required reviewer and self-review allowed.
  - `amo`: the secrets `FIREFOX_JWT_ISSUER` and `FIREFOX_JWT_SECRET`, from addons.mozilla.org › Tools › Manage API Keys. The add-on's GUID and slug are in the workflow.
  - `cws`: the secrets `CHROME_PUBLISHER_ID`, `CHROME_EXTENSION_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` and `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`. Store the PEM with real newlines.
- **Repo variables:**
  - `PUBLISH_AMO`, `true` to submit to AMO.
  - `PUBLISH_CWS`, `true` to submit to the Chrome Web Store. It stays `false` until the item exists: the API can't create one, so `v1.99.1`'s Chrome zip is uploaded by hand, as Unlisted, from the run's artifacts.
  - `CWS_PUBLISH_TYPE`, `DEFAULT_PUBLISH` or `STAGED_PUBLISH`.
  - Optionally `WXT_AUTH_SERVER_URL`, the broker the builds default to.
- **A ruleset on `main`:** pull requests required, the CI `build` check required, no force pushes.
- Before setting `PUBLISH_AMO`, check that the API key works: run `bun scripts/amo-version.ts exists 1.4.5` with the three `FIREFOX_*` variables set. It should print `true`.

## Publishing by hand

Fill in `.env.submit` (or run `bunx wxt submit init`), then run `bunx wxt submit`. See [Environment files](environment-files.md).
