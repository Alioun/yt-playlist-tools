# `dev` integrates, and a merge to `main` with a new version releases it

`dev` is the default branch: PRs and Dependabot target it, and every push builds dev builds, which are unsigned and kept only as CI artifacts. `main` holds what's released. Every push to `main` runs `release.yml`, whose `meta` job decides from the tags alone. It releases when `package.json`'s version is a strict `N.N.N`, `v{version}` doesn't exist yet, and the version is above the highest `v*` tag. The run then creates the tag and the GitHub release in one step with its own token, and each store's submission waits for approval in its `amo` or `cws` environment. To release, the developer bumps the version on `dev` and merges `dev` into `main`. A hotfix is a PR from `hotfix/X.Y.Z`, cut from the last release tag, into `main`, and `main` is then merged back into `dev`.

We chose this because a release is then an ordinary reviewed merge with nothing pushed by hand, and it rests on state that force pushes, merges of many commits and replaced runs can't confuse. The user decided it on 2026-10-21.

## Considered options

- **Hand-pushed `v*` tags** (REL-CI-23 as first written, with a tag ruleset limiting who creates them): a second manual step after the merge, and a tag can be pushed on a commit that never passed `main`'s checks.
- **Release when this push changed the version**, comparing `package.json` at `github.event.before` and at the pushed commit: fragile. A force push, a merge of several commits, or an all-zero `before` gives the wrong answer, and a run replaced in the concurrency queue loses its bump.

## Consequences

- With no tags yet, the first release must be exactly 1.99.1, and 1.5.0 is rejected outright, so it never ships (REL-CI-03). A version below the last release, or one that isn't `N.N.N`, fails the run instead of skipping it.
- "Re-run all jobs" isn't a recovery path: the tag exists by then, so `meta` skips everything. A failed or held store is retried with "Re-run failed jobs", which keeps `meta`'s outputs and `build`'s artifact.
- A tag made with `GITHUB_TOKEN` starts no other workflow, so tagging and releasing happen in one run, and a pushed tag triggers nothing. A `main` ruleset (PRs, the CI `build` check, no force pushes) replaces the `v*` tag ruleset.
- Dependabot's security updates always target the default branch, so they land on `dev`, and are promoted to `main` promptly. A `dev → main` merge with no version bump releases nothing.
- `dev → main` is merged with a merge commit, never squashed, so the branches don't diverge.
