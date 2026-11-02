# The add coordinator

`createAddFlow` coordinates playlist adds, picker unticks, Undo and gathers into a playlist. It implements the settled YT-ADD, YT-PK-04/05, YM-SAVE, YM-PICK-7/8 and UI-PICK-07/09 rules. It runs no site code. Its browser-session memory goes through the canonical owner's session port. No entrypoint, gateway or picker calls it yet. This source and its tests are authored and unexecuted.

```ts
const flow = createAddFlow({ execution, owner, session: { read: store.readSession, change: store.changeSession }, now: Date.now, wait, generation: () => crypto.randomUUID() })
const report = await flow.add({ via: "shortcut", site: "www", video, shortcut }, origin)
if (report.kind === "report" && report.toast) show(toastText(report.toast, titles, "www"), report.undo)
const removed = await flow.remove({ site: "www", video, playlist, opener: "quick-save", tick }, origin)
if (removed.kind === "removed") retainForFeedback(removed)
await flow.undo(handle, origin)
flow.release(handle)
await flow.skip({ kind: "skip", acct, video, playlists: "all" }, origin)
await flow.pause(true)
flow.releaseTab(lane)
await flow.quiesce()
```

## Ports and ownership

`execution(origin, site)` resolves a page through the later Tabs caller. It returns an account, a `lane` for one page load and seven typed job methods. Every invocation carries its account pin. Each actual request checks owner authority, lane failures, account pauses and its pin after waiting for the lane. The real executor must enforce that pin against the page's live account.

`owner.shared(feature)` captures the feature's switch and Show feedback. For picker operations the later owner resolves `{ kind: "picker", opener }` to the opener's settings. `owner.account(feature, acct)` reads account targets and creation times. `owner.writable()` represents consent and lifecycle authority. `owner.recentAdds()` reads Keep a list of recent adds, and `owner.titles(acct)` names the account's cached playlists, so every add with an added outcome outside a private window lists one Recent adds entry, and its Undo drops it (DATA-52). Each `owner.mark(change, origin)` retains the private-window origin. The store owns private-window refusal. That wiring is not built.

`now()` is wall time. It drives recent-add memory, account pauses and new-playlist waits, and every persisted deadline compares across workers. `wait(ms)` serves only the new-playlist wait. AddFlow creates no timer. Shutdown interrupts that wait through its stopping promise.

## Session memory

`session` is the owner's `readSession`/`changeSession` pair from `src/background/store/session-memory.README.md`. Every action reads it after its target lookup and before it uses skips, Pause, recent adds, cooldowns, shown-once memory or gathers. A read that fails sends nothing. Auto-add stays quiet, and explicit actions report `not-sent`. A disposed or consent-held owner stops the engine.

Normal memory is the owner's last confirmed view plus this engine's pending edits and retained facts from rejected writes. A cleanly rejected session write keeps a confirmed recent add or active 429 deadline in the engine and leaves the storage failure visible in reports. Later reads cannot erase those facts. Expiry, backwards wall time, account removal and owner revocation end their authority. A successful Undo supersedes a retained recent-add fact. The engine neither retries YouTube nor claims that rejected facts are durable.

Confirmed adds, 429 deadlines, skips, shown-once keys and gather records are written as edits, never as a whole snapshot. A gather returns its Undo handle only once its record is remembered. A failed session write never changes a confirmed YouTube outcome in a report. Account removal revokes only that account's ordinary Undo and private records. Unrelated accounts keep both.

An origin with `incognito: true` uses private memory. It is a separate record in this engine's variables, built from nothing and never written. Pause is the one shared switch, as DATA-32 allows, so private auto-add obeys it. A private gather's handle never resolves from a normal origin, and the reverse.

`pause(paused)` writes the shared switch. Pause quiets auto-add only. Explicit actions and Undo still run. `skip(request, origin)` sets or clears a session skip for the tab router, which resolves `acct` from its authenticated registry. Explicit adds ignore skips.

Handle IDs are `<generation>:<n>`. A new engine never reissues an earlier engine's ID, so an old toast cannot reach a different operation. Ordinary add and removal Undo lives in this engine's memory. It ends with `release`, with `releaseTab(lane)` when the tab registry reports a reload or close, or with the engine. Gather Undo lives in the session record, keeps its original account, is one-use and keeps the last five across engines. When the owner reports a new removal revision, the engine drops ordinary Undo and private memory.

## Data and ordering

`subscribePrivateSkips` reports the affected account and private scope after an actual private skip change. Every explicit and internal skip edit uses `remember`. A fresh successful load and the captured account revision guard the synchronous memory commit. A failed load, removed account, stopped owner or quiesced engine cannot commit a skip or emit success. Repeated equal edits emit nothing. Listener exceptions do not block other listeners. Unsubscribe removes that registration, and engine shutdown revokes all remaining registrations.

Recent-add, cooldown and other confirmed request facts retain their immediate private memory timing while their fresh reads drain. Private automatic untick and Undo await their skip confirmation inside the existing tuple hold. Queued private auto-add checks skips again after acquiring that hold. Explicit actions and legitimate Undo keep their original permissions. Private skips never reach session storage. Normal skip persistence and its canonical owner events keep their original path.

Promise tails serialize each account, playlist and video across features and tabs. Separate lane tails serialize requests in each page load. Each action keeps its progress outside the request loop, so a stopped stage cannot erase a confirmed effect. Playlist reports use the feedback planner's outcome record. Batch reports preserve unique videos in input order.

The removal representations were compared before implementation.

| Representation | Consequence |
| --- | --- |
| Existing `remove` and `unsave`, with exclusive `{ setVideoId }` or `{ videoId }` | Preserves the accepted exact-entry wire form and serves both sites. Chosen. |
| New `removeVideo` and a Music equivalent | Requires vocabulary, routing and adapter changes beyond this fence to express the same identities. |

`RemovalIdentity` uses mutually exclusive union branches. The job guard rejects both identities, neither identity and extra fields. Add and save success data require `setVideoId: SetVideoId | null`. Null means a positively confirmed addition with no returned entry ID. Missing data and failed or unknown writes never imply success.

Local entry identity derives from the removal contract. An exact returned ID always wins. A confirmed new addition with no returned entry ID retains video fallback authority. The action skips known membership and recognizes duplicate rejection without creating an Undo entry. That is why a new addition is accepted only where the video was absent. An unreadable membership result may permit an explicit request, but cannot itself grant fallback authority. The executor must positively confirm a new addition before returning success, including normalized null. Unknown or merely sent writes return failure. The real adapter still needs recorded proof of this distinction.

`Answer<"addBatch">` also accepts `observed` results. Each item is the contract's batch result or an exclusive recognized `duplicate` or `refused` fact. Length and video order must match the request. A duplicate reports `already-in` without an Undo entry. A refusal stays local to its video. Other confirmed items remain in the same report. These are injected normalized observations, not YouTube response strings.

## Removal and Undo

An untick waits for the tuple's pending add, then reads membership with the account guard. A failed read writes nothing. An unreadable result has passed the account portion and permits explicit removal. The picker's own tick selects its exact identity. Without that record, the request uses video-ID removal with Save-dialog semantics. An account mismatch on a retained tick refuses the request. An already-absent video settles without a write or an inverse-write token.

A confirmed removal returns its playlist, video, captured feedback switch, confirmation plan and a `remove` Undo handle. The copy is `Removed “{title}” from {Playlist}`. Page callers show that toast. Popup callers show `Removed · Undo` for six seconds and own their timer. Callers retain the handle when the picker closes, then call `release` when their Undo affordance expires. AddFlow does not tie removal handles to picker lifetime or the last-five gather limit.

Removal Undo starts with fresh membership and account checks, then appends through add or save. If a later explicit tick already restored the video, Undo consumes its handle without another add. Concurrent Undo calls serialize. The follower finds an expired handle. Release revokes an Undo waiting to write. Failed Undo retains uncompleted entries for an explicit retry, returns the failure and `completed`/`of` counts, and plans `Couldn't undo.` Counts describe completed inverse effects, including settled absence or presence.

Add Undo removes exact entry IDs where available and never broadens them into video removal. Confirmed new entries with missing IDs use the guarded video fallback. Gather Undo keeps exact-entry chunks of at most 50. Missing-ID entries use individual guarded removal. A short removeBatch count is a failure. Its uncorrelated chunk stays available for an explicit retry.

Ordinary add handles expire through `release`. Gather handles survive release for the last five gathers. Removal handles survive gathers and expire through release. Unticking an auto-add target and undoing an auto-add set the session skip for that video and playlist.

## Reports and stopping

Ordinary picker adds stay inline-only. Choose-mode picks leave destinations and first-pick feedback to the later picker caller. The first-pick policies (R171 to R173) live in `PickerModel`, not here. Missing and Full marks come from write answers. Unavailable feedback remains unrecognised. A 429 pauses that account for 60 seconds.

Signed-out explicit add, remove, batch and Undo calls return `signed-out`. A later caller presents the typed `{ kind: "sign-in" }` action using the request's site, without inventing a playlist target or a toast report. Auto-add stays silent before target lookup. Sign-in UI wiring is not built.

Stopped adds retain observed outcomes and list pending playlists. Stopped batches retain observed outcomes and list unobserved videos. Gather must close only confirmed videos, never pending ones. Stopped unticks retain whether removal was confirmed. Stopped Undo retains its completed count. Stopped reports grant no Undo handle.

Withdrawal, shutdown or owner loss permanently stops this coordinator and revokes its in-memory handles. It never erases normal session history, because worker teardown is not account removal. A later owner needs a new coordinator through its own lifecycle. `quiesce` is idempotent and drains actions already running. Sent requests finish with their observed result. Later requests and marks gain no authority from a token. Only the explicit lifecycle exception becomes a stopped report. Other exceptions stay visible.

## Limits and later checks

The gateway adapter, recorded YouTube proof, Tabs routing, native `storage.session` wiring, Clear all data, the Gather controller, the popup's Recent adds view and UI containers remain later work. Normalized contracts prove no raw status, endpoint, response mapping or signed-in capability. No credential or cookie code is added. Native guarantees remain unproven, privacy approval pending and production activation held.

The focused commands, intended-line probes, sensitivity proposals and static replay evidence live in `.audit/add-flow-completion-authoring-20261029/` and, for session integration, `.audit/session-owner-20261029/`. Runtime acceptance belongs to the sole runtime lease holder.
