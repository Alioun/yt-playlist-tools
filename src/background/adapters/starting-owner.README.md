# Starting canonical owner

`createBrowserStartingLocalFilterWriter(native, options)` constructs one actual `createStartingLocalFilterWriter` owner. Its returned methods derive from that constructor. `session.read` and `session.change` are the same owner's `readSession` and `changeSession` functions. The first-run receiver, Setup, Tabs, tab-view producer, and AddFlow use those existing types.

`options.local` and `options.startup` are mandatory supplied collaborators for the same storage source. The caller owns that correspondence and the approval of both boundaries. The adapter cannot prove either fact. It uses `native.storage.local` as the identity for the shared adapter guard. Every canonical local read and write uses the supplied port. There is no raw native local fallback. The one native local call is `remove`, which the account-removal host below makes for exact account keys.

`ready()` retains the canonical startup promise, including `newer-layout`, original errors, and structured `StartupReadinessError` results. Construction never starts sync. Native session and sync methods bind only to the canonical dependencies. Sync events use the sync area's `onChanged` event. Timers default to native `setTimeout` and `clearTimeout`. Optional clock and stamp functions support deterministic consumers.

The legacy facade and this facade share `starting-owner-area.ts`. The WeakSet excludes duplicate owners only for the same local-area object in one realm. Constructor failure releases admission. Disposal rejects new adapter storage calls, gates saved callbacks, calls the canonical teardown, and caches its promise. It releases admission only after canonical draining and confirmed binding teardown. A failed removal or timer cancellation retains admission and its failure. An unconfirmed teardown has no automatic retry or successful replacement admission.

The adapter builds the account-removal host itself with `nativeAccountRemovalHost`. That host maps each typed removal key to its storage name and calls `native.storage.local.remove`. Its session ports are the owner's canonical session ports. Both refuse calls once disposal starts. Callers cannot supply a removal host. Removal needs no claim, join, recovery, or canonical-authority host.

Claim, join, recovery, and canonical-authority hosts remain unavailable. Native configuration excludes their fixture variants and rejects them at runtime. This adapter supplies no credential observer, import cleanup implementation, retirement proof, or native ownership capability. The approved startup host remains responsible for its own finite work.

The implementation leaves the legacy caller, entrypoints, canonical owners, host implementations, full TabView, gateway, registry, ExtLink, Tabs, AddFlow, Backend, localization, and WXT exclusion source unchanged. Accounts, cache, auto-add, and Monitor owner additions require reconciliation before qualification. The adapter does not complete 2.0.

Behavior tests, intended-line type negatives, and the authenticated receiver consumer are authored in this unit. None has executed. See `tools/fixtures/starting-owner/README.md` for the proposed qualification gates. Native durability, native exclusion, and credential isolation remain unproven. Privacy approval is pending. Activation remains held.
