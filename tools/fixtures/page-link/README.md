# PageLink fixtures

`run.ts direct` and `run.ts dom` drive the real `servePage` and PageLink through their respective channel adapters. Both emit the same deterministic records through the safe public API. The records cover hello, account projection, an element-targeted job, a probe, a stream, a signal, a stale account pin, and disposal. Each run rejects output containing the synthetic raw-identity sentinel before printing. Node's standard SHA-256 implementation supplies an independent expected key.

`deadlines.ts` uses production timers. It checks the actual 2-second absent-gateway hello and the 10-second unconfirmed write. The synthetic gateway receives one call and no retry. Neither fixture uses an entry point, network, browser session, real account, or credential.

The lease holder runs each command with the fixed clean environment and scratch HOME recorded in its gate receipts. Bun requires `--no-env-file`. Each command needs its own `timeout -k 10` with a bound no greater than 540 seconds. Dependencies must already be prepared.

`support.ts` supplies synthetic gateway operations, tracked channels, and a deterministic clock for adjacent PageLink tests. It never ships in the extension.
