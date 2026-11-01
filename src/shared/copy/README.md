# Add outcomes and toast copy

`rules/outcomes.ts` and `copy/` hold the add flow's feedback as pure data (06 §6.4.1). They cover YT-ADD-04, YT-ADD-12 to YT-ADD-39 and UI-TOAST-01 to UI-TOAST-12, plus R7, R22, R24, R26, R27, R45, R55, R56 and R77. The background add flow (`src/background/add-flow`) calls `toastPlan`. No site or kit calls them yet.

```ts
const failure = failureOf(jobFailure)                // per playlist, from the gateway's JobFailure
const plan = toastPlan({ kind: "auto-add", outcomes, shown }, feedback)
if (plan) {
  remember(plan.remember)                            // the runtime owner's tab and session sets
  show(toastText(plan, titles, site, i18n), plan)
}
```

## The model

- **`Failure`** is one row of YT-ADD-28, in that table's order. `paused` is an add that failed at once during a rate-limit pause (YT-ADD-37).
- **`Outcome`** is one of YT-ADD-04's five. A report holds exactly one per playlist, as `Record<PlaylistId, Outcome>`, the shape `AddReport.outcomes` takes in 06.
- **`Report`** says who asked. Auto-add carries its `shown` memory. Explicit reports cannot carry it, nor filtered, skipped or `membership-unreadable` outcomes. `pending` and `no-playlist` have no outcomes.
- **`ToastPlan`** is `null` for no toast. Otherwise it has a tone, `auto`, one `Message`, at most one `Action` and the `remember` keys.

Two shapes were compared. Pre-grouped buckets (`added[]`, `failed[]`, and so on) let a playlist sit in two buckets and need a second conversion from `AddReport.outcomes`. The outcome map keeps one outcome per playlist by construction, so it was chosen. A situation enum chosen by the add flow was also rejected, because the grouping, precedence and mixed rules would then live in every caller.

## The rules

- Show feedback off hides confirmations, the pending toast and the filtered-out note. Failures, already-in, the no-playlist hint and the unknown-channel note always show.
- Auto-add is silent when signed out, already in everywhere, skipped, or adding during a pause.
- Auto-add's limits are YT-ADD-25's table. Missing and full are once per playlist per session. A refused video and the unknown-channel note are once per session. An account change and an account that can't use playlists are once per tab. Other failures repeat. Explicit adds are never limited and remember nothing.
- The runtime owner keeps a set per tab and one per browser session, passes them as `shown`, and adds the plan's `remember` keys. A failure already shown gives way to the next failure, else to the confirmation.
- Several failure kinds name only the first in YT-ADD-28's order, with that failure's playlists and fix.
- Saved and failed carries the failure's fix, never Undo. Saved and filtered keeps Undo.
- An ordinary picker tick gets no toast, whatever its outcome. Its row answers in place (YT-PK-04, UI-PICK-07). The picker's toasts are choose mode's first pick and an untick (YT-PK-05), and the untick's copy is not in this planner yet.
- Missing and full open Settings for auto-add and shortcuts, and Choose for quick-save. Choose picks get no fix. Try again appears only on auto-add's offline, no-answer and unrecognised failures.

## Copy

`toastText` follows YT-ADD-18, YT-ADD-27, YT-ADD-28 and 03 §13. Titles are cut after 40 user-perceived characters with "…". Video titles are quoted, playlist titles are not, except in "{Shortcut} now saves to “{Playlist}”.". An unknown video reads "this video" ("This video" at a sentence start, "this song" on YouTube Music). An unknown playlist reads "a playlist that's no longer available". "save" reads "auto-add" in auto-add's own failures.

Some copy is derived, not quoted from a table. That covers the saved-and-failed second sentence for every failure except missing, plural missing and full, auto-add's refused wording, and the "This shortcut" and "this channel" fallbacks.

## Limits

`failureOf` reads only the reason and HTTP 429. The rest of `failed` reads as unrecognised, because no recorded answer yet shows which YouTube statuses mean missing, full, refused or an account that can't use playlists. `unavailable` also reads as unrecognised. ARC-ACC-39 includes a missing hook, a handler that throws before sending and a missing answer, so this reason alone does not establish an offline connection. Callers that observe an unsent request can report the existing `not-sent` failure to get YT-ADD-35's offline copy. The gateway's parsers and their fixtures own the finer facts.

Run `bun test ./src/shared/rules/outcomes.bun-test.ts ./src/shared/copy/toast.bun-test.ts`.

## Removal feedback

The planner accepts `removed` with one playlist and returns an Undo confirmation only when the opening feature's Show feedback is on. The copy is `Removed “{title}” from {Playlist}`. `undo-failed` always returns `Couldn't undo.` with no action. Popup callers own their six-second inline Undo presentation.

## Localization

`toastText` now requires an independent `I18n` instance. The only English catalogue is `src/public/_locales/en/messages.json`. `shared/i18n` accepts that catalogue and a native-shaped message port. `ui/backend/browser.ts` binds the actual native `getMessage` method separately from Backend authority. Main entry assembly remains deferred.

`messages.ts` selects complete catalogue messages for each site, titled or untitled item, action and plural form. Saved and failed feedback uses a single message for both sentences. It never translates verbs or sentence endings separately. Named values carry title data and list labels. Missing playlist, account, shortcut and channel labels remain the existing fallback names. List templates preserve the existing one, two, three, or two and more behavior.

`Intl.PluralRules` selects complete count messages. `Intl.NumberFormat` disables grouping to preserve existing English counts. Grapheme truncation and quoting are unchanged. The scripted fixture reads the actual JSON. Pseudo text exists only under `tools/fixtures/localization`.

All localization behavior, compiler and fixture gates are authored and unexecuted. The authoring unit holds no runtime lease. No native integration or wording approval follows from this migration.
