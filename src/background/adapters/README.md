# Background adapters

These files connect the background Store core to its callers. `sender-origin.ts` resolves an authenticated message sender. `runtime.ts` is the background's native transport for the typed RPC. `local-filter-writer.ts` is the dormant browser Filter adapter. `startup-source.ts` builds the Store startup host from a sanitized source observation.

## Sender origin

`resolveSenderOrigin(ports, { sender, popupWindowId })` reads only native sender metadata. The popup's window ID is the one claim it accepts from a message, and it checks that ID with `windows.get`. The extension pages are matched by exact URL: `popup.html` is the popup, `options.html` is `settings`, and `onboarding.html` is the first-run page, `onboarding`. Settings and the first-run page take their window and privacy from the native frame-zero `sender.tab`, cross-checked with `windows.get`. Content senders are recognized by the prefixes `https://www.youtube.com/` and `https://music.youtube.com/`, and a tab result carries the matching native `site`. The extension ID, frame, tab and window ID and privacy checks apply to every caller. `changeFromSettings` still admits only `settings`.

## Runtime transport

`runtimeTransport(runtime)` returns the `Transport<NativeSender>` for `createRpc`. `send` calls `runtime.sendMessage`. `listen` adds one `runtime.onMessage` listener, and its disposer removes it once.

The listener returns literal `false` when `receive` does not claim a message or throws, so another listener can answer it. For a claimed message it returns literal `true` and answers through `sendResponse` when the claim settles. A rejected claim is answered with `undefined`. It never returns the answer promise, because a listener's returned value only signals whether it will reply. A throwing `sendResponse` is contained. Disposal answers every open claim with `undefined` at once, and a claim that settles later is never published. The adapter adds no retry, port, heartbeat, storage or module state.

`tabTarget(tabs, tabId)` has only `send`. Each send calls `tabs.sendMessage(tabId, message, { frameId: 0 })` and returns its promise, rejection or synchronous throw unchanged. It registers no listener. Use the qualified `createRpcCaller(tabTarget(tabs, tabId), options)` for calls without an inbound listener. The native fixture exercises that consumer and prints its complete request and outcome.

`timerDeadline` is the one-shot `Deadline`. It arms one `setTimeout`, and its canceller clears an armed timer once and does nothing after the timer fired.

`authenticateTab(ports)` accepts only a native `tab` result, and its context carries the native `site`, tab origin and window ID. `authenticateUi(ports, popupWindowIdOf)` accepts only a native `ui` result. `popupWindowIdOf(request)` names the request field that carries the popup's window claim. Message maps belong to their owners, so the adapter defines none. Every other result is `rejected`, which the caller reads as `invalid-answer`. A kind must stay unique across every map on the runtime bus, because a claim happens before authentication.

Native behavior remains unproven. That covers Chrome and Firefox listener return handling, `undefined` responses, port-closed rejections, sender fields without the `tabs` permission, Music sender URLs, private-window facts, frame-zero delivery after navigation and service-worker lifetime.

## Sanitized startup source

`createStoreStartupHost({ context, source, cleanup })` returns the `StoreStartupHost` that `createStartingLocalFilterWriter` consumes. It is not a second startup owner. The starting owner keeps its first lane, readiness, readback, uncertainty and lifetime. The planner and executor keep cleanup order. The host has no set, get or remove of its own. Its three cleanup methods call the supplied ports with the executor's keys and await them.

`source.readInventory()` returns one `SanitizedStartupInventory`. `presentLocalKeys` lists every observed local key name, including credential names and unrelated names. `values` holds a value only for names that `isStartupValueKey` accepts. Those are the interim source keys, the canonical keys and `interimConversion`. The seven noncredential legacy value fields are interim source keys. `clientID`, `clientSecret`, `accessToken`, `refreshToken`, `authMode`, `authServerURL`, `sync` and pending checkpoints carry names only.

Each `readSnapshot()` and `readInterimSnapshot()` call samples the source once, and nothing is cached between calls. Separate reads are not atomic with each other or with a mutation. The owner's readback compares a later sample with the earlier one. Both reads validate an observation the same way.

- `readInterimSnapshot()` selects the source and canonical maps in name order and reports `interimConversion` as present whenever its name is present. It passes both historical facts through and needs no original-path authorization.
- `readSnapshot()` reports legacy key names in `LEGACY_DELETE_KEYS` order, the seven legacy values, the canonical records and the names of interim evidence. It refuses when `legacyAuthorization` is `unavailable`. It never turns unavailable into false.

An observed true `refreshTokenWasNonempty` requires a present `refreshToken` name. After cleanup removes that name, the source must report observed false. The upgrade note keeps the first captured result.

The adapter checks names and property descriptors before it reads a value. It refuses with `StartupSourceRefusal` and a fixed code, and the message contains only that code.

| Code | Observation |
| --- | --- |
| `structure` | A missing or extra inventory field, a malformed name list, fact or authorization, a symbol key, a non-enumerable property, a function, a cycle, or an object other than a plain object, null-prototype object or array. |
| `accessor` | Any accessor property, at any depth. The getter never runs. |
| `duplicate-name` | A repeated name in `presentLocalKeys`. |
| `forbidden-value` | A value field for a name that carries no value, such as a credential name. |
| `absent-name` | A value field whose name is not in `presentLocalKeys`. |
| `incomplete` | A listed name that carries a value but has no value field. |
| `authorization-contradiction` | Observed true without a present `refreshToken` name. |
| `authorization-unavailable` | `readSnapshot()` without observed original-path authorization. |

A rejected `readInventory()` propagates its original error unchanged.

The adapter copies values by walking own data properties. The copy keeps own `undefined` fields, own `__proto__` keys, null prototypes, array holes, inert `toJSON` data and every unknown extension. It never calls `toJSON` and never decodes or rewrites a document, so the owner's validators see the source as observed. Later changes to the returned objects do not reach an earlier snapshot. The adapter copies `context` once at construction.

`projectInterimSnapshot(inventory)` is the synchronous form of `readInterimSnapshot()`. The interim fixture's `interimSnapshot(records)` export uses it.

## Boundaries

This adapter consumes synthetic sanitized observations only. It reads no browser storage, credentials, permissions, network, timers, process state or environment. It is separate from `LocalWriteStorage.get(null)`, which still supplies the complete local record that ordinary transactions compare. Do not feed the selected maps into that port.

A native provider is a separate unit. It must enumerate names on both supported targets without reading credential values, capture the nonempty refresh fact before ordered deletion, and supply interim history from real evidence. Any provider that reads credential-bearing data is secret-handling code. It needs credential-free failure-path tests, a separate secret-flow review and approval of the exact frozen files before it runs. No such provider exists here. Native checks remain waived and unproven.

## Verification

```sh
bun --no-env-file --no-install test --isolate --conditions=browser ./src/background/adapters/startup-source.bun-test.ts
bun --no-env-file --no-install test --isolate --conditions=browser ./src/background/adapters/runtime.bun-test.ts ./src/background/adapters/sender-origin.bun-test.ts
bun --no-env-file --no-install tools/fixtures/native-runtime/run.ts
bun --no-env-file --no-install tools/fixtures/claim-transaction/run.ts
bun --no-env-file --no-install tools/fixtures/interim-conversion/run.ts
```

The claim and interim fixture commands build their starting owners through this adapter. `syntheticStartupInventory(records, facts)` in `tools/fixtures/interim-conversion/run.ts` turns a synthetic backing record into an inventory for both commands. `runtime.type-test.ts` checks the native and fake ports against the runtime, tab and sender-origin ports, keeps the tab target send-only and keeps tab and UI contexts apart. The native runtime command prints the 14 lines its README lists. `startup-source.type-test.ts` rejects a missing source read, a missing cleanup port, a missing historical fact, malformed facts and a boolean in place of unavailable authorization.
