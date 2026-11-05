# Page channel fixture

This command runs the real `servePage` over a direct page channel with dummy gateway operations and prints one JSON line per answer.

```sh
bun --no-env-file tools/fixtures/page-channel/run.ts
```

The core side of the fixture sends `hello`, `run`, `probe`, `watch` and `unwatch` as JSON strings and checks each answer with the guard from `src/shared/contracts/page.ts` for its pending ID. Expected output is `hello`, `run`, `probe` and `stream` with `accepted: true`, then one `retired` record with `accepted: true`. Any `after unwatch` or `after retire` line means an answer leaked and prints `accepted: false`.

`runPageChannelFixture()` returns the same records for a caller. Nothing here touches a DOM, YouTube, cookies or the network.
