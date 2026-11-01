# Releasing Perchling

The release checklist (spec 08-release §18, REL-CHK-18). [docs/development/releasing.md](docs/development/releasing.md) explains how `release.yml` decides, builds, tags and submits. This file is what the developer ticks off around it. Every release run's summary links here.

## Once, before the first beta

- [ ] The manifest says Perchling: `name` "Perchling for YouTube™", `short_name` "Perchling", and the `description` in [store/listing/README.md](store/listing/README.md). The icons are Perch. The professional trademark search for "Perchling", the EU above all, is under way or done.
- [ ] The Firefox manifest declares `data_collection_permissions: {required: ["none"]}`. Spec §13's fallback applies only if a reviewer has objected.
- [ ] Ticket 25's route table is filled, and the cookie lines are kept or removed together in the disclosure, [the privacy policy](site/privacy/index.html), [the dashboard answers](store/cws-dashboard.md) and [the reviewer notes](store/notes/reviewer-full.md). They're removed if no shipped route reads the session cookie. Each one is marked `PROVISIONAL` in a comment.
- [ ] The Chrome Web Store developer account is ready: 2-Step Verification, the fee, the publisher name, a verified contact e-mail, and the trader or non-trader declaration. The Store listing and Privacy tabs are drafted from [store/listing/](store/listing/README.md) and [store/cws-dashboard.md](store/cws-dashboard.md). The first upload is `v1.99.1` (see Beta).
- [ ] The Chrome Web Store service account is created, the API is enabled, and the account is added under Account in the dashboard. The `amo` and `cws` environments, the repo variables and the `main` ruleset are set up as [docs/development/releasing.md](docs/development/releasing.md#github-setup) describes, and the old secrets are deleted.
- [ ] Pages is enabled, with GitHub Actions as the source. If the `github-pages` environment limits deployment branches, `main` is allowed. **Actions › Pages › Run workflow** on `main` has deployed, and `/`, `/privacy/` and `/beta/` have been read through. The policy takes effect from 1.99.1.
- [ ] Once the site is live, the privacy policy joins the links in [.github/ISSUE_TEMPLATE/config.yml](.github/ISSUE_TEMPLATE/config.yml).
- [ ] The reviewer test account is ready, and `AMO_REVIEWER_LOGIN` is set. CI doesn't read it yet: the design that fills the reviewer notes from it waits for the developer's approval (G28).
- [ ] `server/` is retired, any deployment of the token broker is shut down, and its OAuth client is deleted.
- [ ] The screenshots are in `store/listing/` next to the promo images. AMO's listing icon, `assets/icon/amo-128.png`, is uploaded.

## Every release

- [ ] On `dev`, `package.json`'s version is bumped and `store/release-notes/{version}.md` is written. It becomes the AMO release notes and the GitHub release text.
- [ ] The watch is alive: `gh workflow view watch.yml` shows it enabled, with a scheduled run in the last 2 days. If not, run `gh workflow enable watch.yml`. GitHub disables schedules after 60 days without activity.
- [ ] The signed-in live check has run in Chrome and Firefox from this commit's live-check build, the captures are imported, and `store/live-checks/{version}.json` is committed. Every release needs it, hotfixes for bugs of our own included. It takes a few minutes.
- [ ] The timing test has run at 1× and 4× on the reference machine, and the figures are in the release PR. Chromium's must be within budget. Firefox's `performance.mark` figures are for information only.
- [ ] The manual screen-reader pass of the popup and settings is done.
- [ ] The running-cost check is done in Chrome and Firefox, and its table is in the release PR.
- [ ] Has the manifest changed? Check the `--report-against` table in the `build` summary, and list each change in the release PR.
  - A new install warning disables Chrome until the user accepts it, and holds Firefox updates, so prefer none.
  - If data handling changed, bump the consent version, and update the privacy policy and the dashboard answers in the same release.
- [ ] Has `schema` been bumped? Then the release PR says "Rolling back past this version leaves the extension inert."
- [ ] Merge `dev` to `main` with the bumped version, as a merge commit, never a squash. Read the gate summary (sizes against `main`, the manifest diff, the watch), then approve `amo` and `cws`, or reject one to hold that store.
- [ ] Afterwards:
  - AMO shows the version public (within 24 hours), and Chrome shows it approved and published;
  - the GitHub release is out, with its notes;
  - store reviews and issues are watched for 48 hours;
  - the reviewer account's backup codes are refreshed if a reviewer used them.

## Beta

- [ ] The first beta only: merge to `main` with the version `1.99.1` and `PUBLISH_CWS=false`. Upload that run's Chrome zip by hand as Unlisted, fill the Store listing and Privacy tabs, then set `PUBLISH_CWS=true`. Once Chrome approves it, add the item's link to [site/beta/index.html](site/beta/index.html).
- [ ] Merge to `main` with the version bumped to `1.99.N`. The run attaches the signed `.xpi` to the pre-release and starts the Pages workflow, so `/beta/updates.json` and the `/beta/` page list it. From `1.99.2` on, the run updates the Unlisted Chrome item through the API.
- [ ] While the beta runs, AMO's description ends with "A rebuilt 2.0 is in beta: https://alioun.github.io/yt-playlist-tools/beta/", and the README has its beta line.

## Hotfix

- [ ] Cut `hotfix/X.Y.Z` from the last release tag. Make only the fix, for a YouTube change or a bug of our own, with no change to permissions, the disclosure, the consent version, the data schema, or any user-visible behaviour beyond the fix. A fix for a YouTube change also updates its fixtures and its watch-list entry.
- [ ] Write `store/release-notes/X.Y.Z.md`, and `store/notes/hotfix/X.Y.Z.md` with one sentence for AMO's reviewers: "Fixes {feature} after a YouTube change to {internal}." or, for a bug of our own, "Fixes {what went wrong} in {feature}." The hotfix reviewer notes start with it.
- [ ] Run the signed-in live check: hotfix scope for a YouTube change, the whole check for a bug of our own. Merge the PR into `main` with the version `X.Y.Z`, and check that the gates pass, `hotfix-freeze` included.
- [ ] Afterwards, comment on the fix's issue ("Firefox users get it within about a day; Chrome users after review"), and merge `main` back into `dev`.

## Bad release

- [ ] Roll back first: AMO Developer Hub › Roll back, with the next patch number, then the Chrome dashboard's rollback. Then submit the fix.
- [ ] The exception is 2.0.0 on AMO. Its predecessor is 1.4.5, which is inert after the migration, so fix forward through the hotfix lane, and roll back only to stop harm: writes to the wrong account, a request storm, or data loss.

## The 2.0 launch, once

- [ ] The launch criteria in spec 08-release §8.2 (REL-CHK-04) hold.
- [ ] Merge to `main` with the version `2.0.0` and `PUBLISH_CWS=false`, and approve `amo`.
- [ ] By hand in the Chrome dashboard: set visibility to Public, upload the `v2.0.0` Chrome zip from the run's artifacts, and choose "publish manually after approval".
- [ ] When AMO shows 2.0.0 public, edit the AMO listing from [store/listing/](store/listing/README.md): the name, summary, description, category, homepage, support URL, privacy policy, icon and screenshots. Remove the beta line.
- [ ] Download AMO's signed 2.0.0 `.xpi` from the Developer Hub, attach it to the `v2.0.0` GitHub release, and run **Actions › Pages › Run workflow** on `main`. Check that `/beta/updates.json` ends with 2.0.0. That's the beta testers' hand-off.
- [ ] Remove the README's beta line.
- [ ] Soak for 7 days. If a 2.0.x ships meanwhile (with `PUBLISH_CWS=false`), cancel the staged Chrome 2.0.0 and submit 2.0.x by hand, with visibility Public and "publish manually after approval".
- [ ] Publish on Chrome. Add the Chrome Web Store link to [site/index.html](site/index.html) and the README, and set `PUBLISH_CWS=true` and `CWS_PUBLISH_TYPE=DEFAULT_PUBLISH`.
- [ ] In the next release, remove `docs/legacy/1.4.5-setup.md`, its README line and its link in the issue chooser.

## Later betas

Betas after the launch are `X.Y.9NN`, on Firefox only. When `X.(Y+1).0` is out on AMO, attach its AMO-signed `.xpi` to its GitHub release and run the Pages workflow, so testers move to it.
