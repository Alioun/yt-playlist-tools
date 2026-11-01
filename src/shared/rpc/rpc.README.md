# Typed RPC over a transport

`createRpc(transport, { build, contract, deadline })` returns `call(kind, payload)`, `handle({ authenticate, handlers })` and `dispose()`. It carries one-shot JSON extension messages between the tab, the background and extension pages (§6.4.1, §6.8.2, §6.8.3). It does not replace the page channel's `CustomEvent` protocol.

`createRpcCaller(transport, options)` returns the derived `RpcCaller<Map>` with only `call` and `dispose`. It accepts `Pick<Transport<never>, "send">` and shares `RpcOptions<Map>` with `createRpc`. It never reads or registers a listener. Background-to-tab targets use this caller because the native send promise carries the answer. The receiving endpoint alone needs `handle` and listener lifecycle state. Both constructors use the same call engine for correlation, deadlines and disposal.

## Message maps and contracts

A message map is a type alias from kind to `{ payload, result }`. One map describes one direction. The tab calls the tab-to-background map and the background handles it. The background calls the background-to-tab map and the tab handles it. Concrete maps belong to their owners and are not defined here.

The caller-provided `RpcContract<Map>` holds, for every kind, a payload guard, a result guard and the kind's one-shot deadline in milliseconds. ARC-MSG-08 sets 2 s for pings and 10 s for jobs. The receiver checks the payload. The caller checks the result. Handlers are a total map over the receiving map, so a missing handler fails to compile.

## Envelope

A request is exactly `{ v, build, id, kind, payload }`. An answer is exactly `{ v, build, id, kind, result }`, or `{ v, build, id, kind, failure: "receiver" }` when a handler throws or rejects. `v` is `CONTRACT_VERSION` and `build` is the endpoint's build (ARC-MSG-09). `id` is a per-instance sequence number, so an instance never reuses an identity. Any extra field, such as a body-supplied origin or sender, fails the exact shape.

## Receiving

A receiver drops a message, without claiming it, unless all of these hold, in order:

1. `inspectMessageHeader` accepts it, so it is own JSON data with this version and build. Accessors are never invoked.
2. The envelope has exactly the request fields, with a nonempty string `id`.
3. `kind` is an own key of the contract. Unknown and inherited kinds are dropped, so another context on the same bus may answer them.
4. The payload passes that kind's guard.

Only then does `authenticate({ sender, request })` run. `sender` is the transport's native sender metadata, delivered beside the message and never read from it. The request's fields are untrusted claims. ARC-MSG-06's popup window ID is one such claim, and the authenticator must verify it natively, as `resolveSenderOrigin` does. A `rejected` result, a throw or a rejection ends the message with no handler call and no answer. An `accepted` result supplies the context that the handler receives.

A handler failure becomes the fixed `failure: "receiver"` answer. No error object, message, stack or input is serialized. Disposing a receiver releases every in-flight answer as unanswered, and a late handler result is never published.

## Calling

`call` registers the pending call and starts its deadline before it sends. It settles exactly once and cancels its deadline exactly once. The outcome is `{ kind: "answered", result }` or `{ kind: "failed", failure }`:

| Failure | Meaning |
|---|---|
| `timeout` | No valid answer arrived before the kind's deadline. |
| `transport` | The transport threw or rejected the send. |
| `invalid-answer` | The answer was missing, malformed, from another request, kind, version or build, or failed the result guard. |
| `receiver-failed` | The receiver answered with the fixed handler failure. |
| `disposed` | The endpoint was disposed before an answer. A call made after disposal sends nothing. |

Every pending failure leaves delivery unknown. The receiver may already have run the request, so a failed write is reported and never retried, and no failure means unsent. There is no retry, interval, heartbeat, storage or module state. Domain refusals travel inside `result`, so they never look like transport failures.

`dispose()` is idempotent. It fails every pending call with `disposed` and stops every receiver. Re-entrant disposal from a deadline canceller or a listener disposer is a no-op.

## Transports

`Transport<Sender>` is `{ send(message), listen(receive) }`. `send` resolves with the raw answer or rejects. `listen` registers `receive({ message, sender })` and returns its disposer. `receive` returns `undefined` for a message it does not claim, or a promise of the answer, where `undefined` means no answer.

`memory.ts` is the deterministic in-memory network for tests and fixtures. Each `connect(sender)` returns one transport. A send is serialized to JSON text and parsed fresh for each listener on every other connection. The sender is cloned at connect time and cloned again for each delivery, so neither bodies nor receivers can change it. The first settled answer wins and later answers are traced as dropped, as with several extension pages on one runtime. With `delivery: "queued"`, each send waits until the test calls its one-shot `deliver()`, `reject()` or `lose()`. `lose()` runs the receivers and then rejects the caller's send. `trace()` and `listening()` expose what crossed the network. A memory sender is a synthetic test claim, not native authentication proof.

## Browser adapters

Native adapters are later units. They live only in the documented adapter locations, never in `shared/`.

- **The tab** (`src/site/core/adapters/runtime.ts`). `send` wraps `browser.runtime.sendMessage(message)`. `listen` registers a `browser.runtime.onMessage` listener that passes `{ message, sender }` to `receive`. An unclaimed delivery returns `false`. A claimed delivery returns literal `true` synchronously and answers through `sendResponse` when the claim settles. Its disposer removes that listener once.
- **The background** (`src/background/adapters/`). One send-only target per tab sends through `browser.tabs.sendMessage(tabId, message, { frameId: 0 })` (ARC-MSG-04). Use `createRpcCaller` for that target. It has no listener or `handle`. A separate receiving transport uses the tab's `onMessage` callback shape. Its authenticator wraps `resolveSenderOrigin` and maps an unavailable result to `rejected`.
- **Extension pages** (`src/ui/backend/browser.ts`). `send` and `listen` take the tab's shape.
- **Deadlines.** Each context injects a one-shot timer, such as `setTimeout` with `clearTimeout` as its canceller, from its adapter.

Browser interoperability is unproven. That covers structured clone against JSON, listener return semantics, `undefined` responses, port-closed rejections and service-worker lifetime.

The prepared WXT wrapper chooses `globalThis.browser` or raw `globalThis.chrome`. It does not establish Promise-return interoperability for native listeners. A native adapter must use the callback contract above, catch a rejected claim and answer `undefined`, and contain errors from `sendResponse`. The memory transport's Promise claim is its own contract and does not prove native behavior.
