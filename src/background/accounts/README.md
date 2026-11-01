# Account labels and seen accounts

`createAccounts` implements normal-window label checks through the canonical Store owner and actual Tabs `accountLabel` job. `onSeen` accepts an internal authenticated `TabContext`. Its account, tab, window, site and privacy come from native routing. A parsed message body is not authentication. Production assembly must obtain this context from Tabs and the authenticated receiver. This unit does not install that binding.

## Normal visits

The owner admits a readable live Setup before any bookkeeping or network read. Seeing a new account creates no Setup, cache, label or `lastAccount` value. `onSeen` returns `no-setup` without fetching. Signed-out and private visits return before owner reads, jobs or writes.

For a normal live Setup, `seeAccountLabel` runs in the existing owner lane. It changes the local `lastAccount` key only when the account changes. A due check reserves `AccountCache.labelAt` in that same local write. Complete record comparison precedes mutation, and complete readback confirms it. Rejected unchanged writes return `failed`. Applied rejection, misleading readback or unavailable confirmation returns `unconfirmed` and stops the owner. A cache or `lastAccount` write allocates no Setup generation and emits no Setup event.

`labelAt` is this browser's attempted check time. It is persisted before dispatch, so a failed or uncertain job consumes its interval across owner restart. No guessed label is stored on failure. A lost process between reservation and dispatch also consumes that interval. This favors the at-most-once requirement over an automatic retry. A current stored label is display data, not proof of a successful recent lookup or account identity.

Exactly 86,400,000 milliseconds after the stamp is due. Earlier times are current. A future stamp, including a backwards wall-clock jump, suppresses checking until the clock reaches that stamp plus 24 hours. The stamp never moves backwards. A missing stamp is due. Invalid clocks are refused before persistence. Both the service clock and owner clock are injected; production must bind them to the same wall clock.

Due visits coalesce while a lookup is pending for the same existing cache owner and account lifetime. Different accounts remain independent. The actual Tabs `runIn` call pins both the account invocation and routing need to the authenticated context. It supplies no fallback tab, polling, switching or broad refresh. Tabs rechecks native privacy, site and account before dispatch. Failed and uncertain answers remain distinct from a committed update.

## Label completion

Only the real owner's opaque cache capture can complete a reserved lookup. The capture uses existing owner reset and per-account removal revisions. Removal and recreation revoke it. A later check stamp or changed label also refuses an older answer. An unrelated destination, filter or cache edit can survive because completion compares the label field and merges into fresh Setup records in the owner lane.

Changed labels use `executeSetupEdit`. That executor owns document admission, materialization, normalization, first-edit provenance, quota and version refusal, fresh records, and complete readback. Newer Settings alone does not block a readable Setup under ARC-MOD-33. A newer addressed Setup or unreadable authority refuses mutation. Only confirmed Setup changes emit `setup-changed` and schedule the existing sync machinery. A successful unchanged answer confirms its local stamp and allocates no generation or sync write.

Names keep at most 100 Unicode code points. The existing localized `copy_account` message supplies the display fallback. The fallback is never persisted as a fetched identity. Optional handles and HTTPS avatars are checked at admission. Known optional fields absent from the latest answer disappear. Compatible label extensions survive and do not alone cause a redundant label generation.

Completion never writes `lastAccount`. A delayed response cannot replace a newer seen-account choice. The service returns the owner outcome, including stale, refused and unconfirmed results, instead of a boolean success. Disposal stops new service work and completion after an in-flight Tabs answer. An owner operation already submitted before service disposal may finish. Owner disposal retains the owner's own write guards.

## Caller-owned header facts

`readLiveLabel` is an explicit header request for a private context or an account without a Setup. It first obtains actual owner readiness through the read-only cache operation, then runs the real account-pinned Tabs job. It returns detached caller-owned facts. It never persists a label, cache or device field. Normal live Setups return `setup-present` so this method cannot bypass the daily normal check. The normal visit path does not fetch a new-account label on every page load.

Actual Tabs may maintain its existing normal tab registry when serving an explicit request. This service adds no session writer. Private Tabs records remain private caller memory under the existing Tabs implementation.

The production private-header binding still needs evidence for a foreign pending-removal race through the existing session read port. That port can resume an unchecked removal. The initial read-only guard holds an already-present removal, but no native race guarantee is established here. Ordinary private `onSeen` does not enter that path. The audit binding proposal records the separate qualification requirement without changing protected session or removal code.

## Claiming dependency

The required `claim` port has explicit `unavailable` and `connected` variants. There is no successful default adapter. An explicitly connected collaborator returns the real owner `claim()` result. The service retains that result separately from labels, including unavailable, no-match, removal-required and unconfirmed outcomes. It does not start claiming after a failed, stale or unconfirmed label operation.

The existing executor is fixture-only, refuses sync-on and can require removal. Playlist-list rows contain no ownership classification. Labels, playlist titles and cached rows prove no ownership. Production ownership and ACC-35's collaborative-playlist question remain open. The exact completion proposal is in the authoring return. This unit does not qualify the complete Accounts service.

## Verification status

The behavior tests and complete consumer are authored but unexecuted. They use the real Store owner and actual Tabs with deterministic local, session, clock and native job ports. The frozen cache, auto-add and registry scopes remain runtime-unqualified. Native guarantees remain unproven, privacy approval is pending, and activation is held.
