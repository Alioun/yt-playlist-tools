# Progressive playlist operations

This source authors cache-first reads for UI-PICK-04 and UI-PICK-25. It starts from frozen tree `1bc25ced85bf2b16b48f4731cf4d996034a73433`, with the qualified cache overlay and the unqualified UI bridge. All runtime gates remain unexecuted. Auto-add and Monitor retain the sole runtime lease.

## The finite protocol

The router previously awaited `Playlists.list().refresh` before returning cached rows. `ui.playlists` now opens a bounded operation and returns the cached listing with finite pending metadata. An explicit await retrieves the same refresh. The service promise stays in the router.

Two designs were compared in-thread.

- A pushed second message would need a subscription, authenticated recipient routing, disconnect cleanup and new RPC delivery semantics. A sender captured at open would also need validation before each push. The existing request channel does not provide that lifetime.
- An explicit operation uses the existing authenticated RPC channel. A client-generated identity permits release before open arrives. Numbered refreshes identify one service job across repeated requests and lost answers. Each returned answer is finite JSON. This is the selected design.

An open carries an account, display site, explicit refresh intent and a validated list-operation ID. Await and refresh carry only that operation and its generation. Release carries only the operation. Each branch has an exact receiver guard. A creation ID cannot name a list operation.

Generation zero identifies an automatic or explicitly requested opening refresh. A fresh cache has no opening refresh. Generation one then starts the first explicit refresh. A repeated generation shares its existing work. An await never starts work. A new refresh generation is refused while the previous one remains pending. Missing operations, older generations and mismatched accounts or sites refuse explicitly.

The router installs the operation before any asynchronous gate. Concurrent opens share that installation. It stores at most 1,024 list operations and 4,096 release tombstones. After tombstone capacity, new opens close. Release removes the live authority and work references. Delayed opens cannot restore a released operation. Router disposal removes its listener and live operation state. The existing 4,096 RPC request limit remains in force.

## Authority across the wait

The router binds an operation to the verified native principal and requester, requested account and display site. It captures the canonical owner's account Setup and session reset and account revision, plus the actual Tabs account-in-view answer. The service authorizes the initial cached snapshot through its canonical cache read. Before returning that snapshot, the router authenticates the requester again. Before returning refreshed rows, it also compares current owner and account-view authority with the captured authority. Every wait rechecks after the service work completes. A replacement document cannot use the old operation.

Private and no-Setup requests retain the real service's caller-owned cache outcomes. A removed Setup, changed native requester or account view, revoked consent, changed session revision, release or disposal prevents the old operation from returning refreshed rows. These are authored properties with unexecuted behavior coverage, not qualified guarantees.

A confirmed native read and confirmed cache persistence remain separate facts. A fast refresh readback failure does not discard the already-authorized cached snapshot. A failed cache set can return confirmed rows with `cache.kind === "failed"`. If failed readback stops the owner, the router withholds rows and returns the confirmed-read fact with the unconfirmed cache status. That answer contains no listing or native result data. It does not call a storage callback a receipt.

The wire preserves the service's site order and nullable readonly cache timestamp. The existing `PickerSource.Listing` requires a number. Its adapter maps only an unknown null timestamp to zero so those rows stay visible and stale. Every known timestamp passes through unchanged. No picker source or model is duplicated.

## The Backend adapter

`Backend.playlistList({ acct, site })` opens one operation. Its `cachedList` and `freshList` methods have the existing PickerSource signatures. `opened` exposes the finite cache and freshness answer. `refresh()` exposes the separate native and cache outcomes. The caller disposes the operation when the picker closes or its account or source changes.

Concurrent Backend refresh calls share one promise. After a lost answer, the next call awaits the same generation instead of starting a new job. There is no timer, background interval, subscription push or polling loop. The existing RPC and Tabs deadlines bound requests.

Each Backend retains at most 256 live list operations. Overflow reports capacity. A shared local listener closes operations on device, schema or relevant Setup changes. Release removes that operation from the listener's map. Backend disposal releases its operations before disposing RPC and suppresses their late answers.

The actual Playlists service still owns the five-minute freshness rule and explicit refresh. The existing PickerModel requests fresh data for stale cached rows. That request awaits generation zero when the opening refresh already exists.

## Authored evidence and qualification holds

`progressive.bun-test.ts` covers withheld native refresh and membership, usable cached rows in the actual PickerModel, exact freshness boundaries, repeated generations, lost answers, account and native changes, consent and Setup removal, private and no-Setup reads, failures, persistence uncertainty, capacity and teardown. `wire.bun-test.ts` covers every new receiver branch. The Backend type proof assigns its methods to the existing PickerSource without a cast.

`run.ts` composes the actual browser Backend, authenticated router, memory RPC transport, canonical owner, Tabs, Playlists and PickerModel. Windows, native tabs, jobs and storage are synthetic ports. Membership, add, remove, create and setting changes are explicit fixture ports. Their synthetic answers are not production storage receipts. The authored transcript ends with one LF and an EOF record. No transcript has been observed.

The gate inventory retains all 56 original bridge gates and adds 23 gates. Its 41 intended-line negatives include the 29 original assertions. The five added sensitivity proposals deliberately block cached rows on refresh, permit cross-account reuse, start a duplicate private refresh, claim optimistic cache persistence and resurrect a released open. Future qualification requires each mutant to compile, fail its named behavior assertion, restore exact bytes and mode, and pass the restored gates. A timeout grants no credit.

Original bridge assertions remain in their source. Its `completedList` fixture helper awaits the new operation only to preserve the old completed-answer assertions. The product route always returns cached rows before its native refresh completes. Creation still uses one open, submit, status and release identity, including uncertainty and lost-answer behavior.

The prepared launcher has been authored for explicit inventory selection, unique receipt names and both direct Bun flags. Its enforcement has not been exercised. Every future invocation requires a new output directory, the exact reconciled source identity, the sole runtime lease and a complete prepared public dependency inventory. The coordinator must audit every Bun descendant for `--no-env-file --no-install`. No prepared dependency or executable identity was supplied by this task, so no runtime identity is claimed.

All original external holds remain. Native durability, ownership and exclusion remain unproven. Privacy wording approval remains open. The three first-pick picker policies were settled on 2026-11-01 (R171 to R173). Production entry assembly, full popup and settings, rendering and axe remain open. The existing picker-adapter hold is retained until qualification and integration, despite this authored read adapter. No production activation is authorized.

The root source-archive launcher remains held because it installs dependencies and invokes Bun without the required flags. The protected test driver also omits `--no-install` from its Bun child. Neither protected path changed. Preserve `excludeSources: ["store/**", "site/**", "tools/**"]`.
