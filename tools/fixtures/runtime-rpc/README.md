# Runtime RPC fixture

This command drives a synthetic send-only tab caller and a synthetic receiving background endpoint through the real `shared/rpc` core over the real memory network. It prints one JSON line per call outcome, one per trace entry, and a closing line with the handled requests, open deadlines and remaining listeners.

```sh
bun --no-env-file tools/fixtures/runtime-rpc/run.ts
```

The network queues every send. The script delivers the add before the hello, delivers a hello from frame 2 of the same tab, and rejects a second add. The contract requires these outcomes, in call order:

1. The hello is answered with `{ "tabId": 7 }`.
2. The first add is answered with `{ "added": ["PLmusic", "WL"] }`.
3. The frame 2 hello fails with `invalid-answer`, because the background's authenticator rejects it before any handler runs.
4. The rejected add fails with `transport`. It is sent once and never retried.

The closing line must show `handled` as `["add v1 for tab 7", "hello www for tab 7"]`, with no open deadlines and no listeners after disposal. Its `callerListeners` counts must be zero for construction, calls and disposal. Only the background registers a listener.

The qualification run checks the complete serialized trace and compares two complete outputs through EOF. Senders here are synthetic test claims, not native browser proof.
