# PageLink reference

`createPageLink(options, channel)` owns the isolated side of the page channel. It has no entry-point import. The owning core supplies the build, site, diagnostic vocabulary, and channel.

`hello` resolves once with a safe snapshot or `unavailable`. The snapshot preserves `pageType`, optional `video`, `startedHidden`, and `navType`. Signed-in account data contains the first 16 characters of base64url SHA-256 of the whole nonempty raw identity. Signed-out data contains `acct: null`. The module never exports the raw identity. Digest errors become `unavailable`. A deadline or disposal ends the caller and prevents any later digest result from publishing state. Web Crypto does not support cancelling an in-flight digest.

`run(invocation, { target })` accepts the existing `JobInvocation`. Account jobs require its trusted `acct` pin. PageLink compares the pin to the successfully projected tab account before sending anything. Missing identity returns `unavailable`. A mismatch returns `accountChanged` without dispatch. Only the job and actual target cross to the page. Account answers receive a fresh digest and pass the safe result guard. Other answers pass their correlated safe job guard. The public result contains no page envelope. Page failure text is discarded, while a validated reason and optional HTTP status remain.

`onState(listener)` immediately supplies the current state and returns a disposer. The states are `connecting`, `ready`, `unavailable`, `accountChanged`, and `disposed`. Snapshots and state records are frozen. A page-reported account change or a newly projected different account publishes `accountChanged`. The owning core uses this state to disarm account-dependent features. PageLink does not implement the gateway's response-context account trip. A changed link stays disarmed until its owner replaces it after reload.

`probe()` resolves with a report for the exact site and watch vocabulary, or `unavailable`. `onSignal(listener)` accepts only signals for this site and diagnostic vocabulary.

`watch(stream, onData)` starts only a supported site stream after hello succeeds. It validates every event against its stream, build, version, and generated watch ID. The callback receives `(data, stop)`, so a synchronous first callback can close its own subscription. The returned `stop` is idempotent. Closing sends one unwatch, releases local state, and suppresses later data.

Hello and probes have 2-second deadlines. Jobs have 10-second deadlines. Timed-out or disposed jobs return `unconfirmed`. This result cannot prove that a remote write was unsent. PageLink never retries a write. It has no interval, heartbeat, or polling loop. `clock` and `digest` are injectable test dependencies. Production defaults use monotonic time, one-shot timers, and Web Crypto SHA-256.

Each instance creates a random namespace and validated, monotonically increasing request and watch IDs. Pending entries contain receiving closures that keep each job, guard, and resolver correlated. A broad result-union map would lose that relationship and require a generic cast. The chosen registry has no unchecked generic cast.

Construction announces the current build on the retire channel. The same build stays live. A valid different build disposes the link. `dispose()` sends each active unwatch, removes listeners, clears timers and subscriptions, finishes pending callers, and prevents later publication. The owning core also calls it for an orphaned extension context. PageLink does not inspect `browser.runtime`.

The real gateway, entry activation, ExtLink, TabView, FeatureHost, and live adapters remain separate units. Synthetic tests do not prove native cross-world isolation, real account behavior, durability, ownership, or exclusion. Privacy approval and production activation remain held.
