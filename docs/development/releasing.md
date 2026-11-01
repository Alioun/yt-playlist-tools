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
   3. waits for your approval in the `amo` and `cws` environments, then submits exactly the files it checked.
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
- **A ruleset on `main`:** pull requests required, the CI `build` check required, no force pushes.
- Before setting `PUBLISH_AMO`, check that the API key works: run `bun scripts/amo-version.ts status 1.4.5` with `FIREFOX_EXTENSION_ID` set to the GUID (with braces) and the JWT pair. It should print `present` or `no-source`; an error means the key is wrong.

## Publishing by hand

Fill in `.env.submit` (or run `bunx wxt submit init`), then build the zips and the AMO metadata it points at, and submit:

```bash
bun run zip && bun run zip:firefox
bun scripts/amo-metadata.ts --version <version> --kind <major|minor|patch> --channel stable --previous <last release> --out .output/amo-metadata.json --strict
bunx wxt submit --firefox-zip .output/*-firefox.zip --firefox-sources-zip .output/*-sources.zip
```

For the Chrome Web Store, prefer `bun scripts/cws-submit.ts .output/*-chrome.zip <version>` with the `CHROME_*` variables set: `wxt submit` fails an upload the store is still processing. See [Environment files](environment-files.md).
