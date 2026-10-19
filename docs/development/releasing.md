# Releasing

[← Development](README.md)

Pushing a `v*` tag runs [`release.yml`](../../.github/workflows/release.yml): zips both targets and checks that the AMO sources zip rebuilds. Store upload runs when the repo variable `PUBLISH_TO_STORES` is `true`, using the secrets listed in [`.env.submit.example`](../../.env.submit.example).

To publish locally, fill in `.env.submit` (or run `bunx wxt submit init`) and run `bunx wxt submit`. See [Environment files](environment-files.md).
