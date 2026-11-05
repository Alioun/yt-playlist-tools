# Page channel

`page-channel.ts` is the `PageChannel` seam between the isolated core and the page-world gateway in one tab. It moves strings and nothing else. Validation, correlation and subscriptions belong to the endpoints: `servePage` in `src/page/channel.ts` on the gateway side, and the later PageLink on the core side.

```ts
const channel = createDomPageChannel(document)          // production, both worlds
const endpoint = servePage(gateway, { site, build, vocabulary, snapshot, signals }, channel)
// core side (PageLink, later)
const stop = channel.listen("res", detail => { /* parseJsonText, then the contextual guard for the pending ID */ })
channel.send("req", JSON.stringify({ v: CONTRACT_VERSION, build, kind: "run", id, job }), card)
endpoint.dispose()
```

The DOM adapter dispatches `ppt:req`, `ppt:res` and `ppt:retire` as `CustomEvent`s with `bubbles` and `composed` and the JSON string as `detail`. A request with a target dispatches on that element and bubbles to the document listener, which hands `event.target` to the gateway. Every other frame dispatches on `document`. The adapter writes no attributes. A listener receives `detail` as `unknown`, because the other world can put anything there.

`createDirectPageChannel()` is the test adapter. It delivers synchronously like `dispatchEvent`, skips listeners removed during delivery, and gives a request's element only to `req` listeners. It carries only strings, so a direct test crosses the same `JSON.stringify` and `parseJsonText` boundary as the DOM. It does not imitate the separation between the two JavaScript worlds. When a listener throws, the others still run, and `send` rethrows the first error afterwards.

## servePage

`servePage(gateway, options, channel)` returns `{ disposed, dispose() }`.

- It ignores every request that fails `parseJsonText` or `isPageRequestMessage` for its build.
- `hello` answers with `options.snapshot()`. `run` calls `gateway.run` once per valid event, with the element target when there is one. `probe` answers with the report for the requested ID. Each answer must pass the matching guard from `contracts/page` for the pending ID, job, site and `vocabulary.watchIds`, or the gateway sends nothing. A run that rejects also gets no answer, and PageLink's timeout covers both cases.
- `watch` starts one subscription per `PageWatchId` for a stream the site supports. A second `watch` with the same ID replaces the first. `unwatch`, replacement, disposal and retirement each call the gateway's disposer exactly once, including when an initial callback runs before `gateway.watch` returns. Data that fails `isPageStreamEventFor` is dropped.
- `options.signals` subscribes to breakage signals. Each signal must pass `isPageSignalEvent` for the site and vocabulary.
- A `ppt:retire` frame that passes `isPageRetireMessage` with a different build disposes the endpoint. The same build does nothing.
- `dispose()` is idempotent. It removes both listeners, releases every watch and the signal subscription, and stops late `run` and `probe` answers. If a disposer throws, the rest still run and `dispose` rethrows the first error.

The module has no timer, polling loop or page observer. It never hashes, signs or forwards the raw `datasyncId`.

## Left to later units

- **createGateway** implements `PageGatewayOperations` with `PageJobResult`, so `account` carries the raw `datasyncId`. The spec's `servePage(gateway, { site, build }, win)` becomes `servePage(gateway, options, createDomPageChannel(win.document))`. The page entry supplies `snapshot` from the gateway's account read and its `document_start` observations, and `signals` from the breakage reporter that `createGateway({ signals })` feeds.
- **PageLink** owns request and watch ID generation, timeouts, sending `retire` for its own build, the `hello` handshake, account-key hashing (ARC-ACC-46) and the trusted-account check (ARC-ACC-47).

## Checks

```sh
timeout -k 10 300 bun test --no-env-file --isolate --conditions=browser ./src/shared/rpc/page-channel.bun-test.ts ./src/page/channel.bun-test.ts
timeout -k 10 120 bun --no-env-file tools/fixtures/page-channel/run.ts
timeout -k 10 540 bun run compile
timeout -k 10 300 bun test --no-env-file --isolate --conditions=browser ./tests/guards/architecture.test.ts
```
