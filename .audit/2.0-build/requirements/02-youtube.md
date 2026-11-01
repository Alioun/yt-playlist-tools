# Requirement pass: 02-youtube.md

Chapter `.scratch/rebuild/spec/02-youtube.md`, 283 defining IDs, checked against `2.0/compose-units` at `f7898dcc8` in `/Users/alioun/.t3/worktrees/yt-playlist-tools/t3-2.0-compose`. Inspect only. No test was run.

## Summary

None of the chapter is built in the shipped extension. The two shipped entrypoints are still the 1.x code. `src/entrypoints/background.ts` and `src/entrypoints/youtube.content.tsx` import `src/lib/*` and `src/components/*`, and the popup and options pages are the React 1.x UI. An import walk from `src/entrypoints/` reaches 61 files. Outside `lib/`, `components/` and `entrypoints/`, the only reached 2.0 files are `background/adapters/sender-origin.ts`, `page/youtube-session.ts` and the `shared/model` decoders. The registry, registrar, store, add flow, gateway, site core, features, picker, keys, monitor and gather modules have no production caller. `wxt.config.ts` declares no `commands`, no optional `contextMenus` and no 2.0 bundles. The counts are 0 built, 0 untested, 169 unwired, 72 partial, 42 missing, 0 external and 0 held. No ID in the chapter is superseded as a whole. The "Superseded earlier text" list changes wording inside live IDs, and the table follows the current text. Of the 169 unwired IDs, nearly all have a Bun test or a fixture gate behind the module. The work left falls into three parts. The first is composition: the background and site core cutover. The second is three features that have no code: quick-save, the watch-page button, and the www shortcuts feature, plus the page-side picker popover. The third is the parts of keys from any tab, the browser menu, Gather's automatic triggers and its feedback, and the extension-page UI that have no code.

How statuses were assigned:

- **Unwired** means the rule's own logic is coded, usually with tests, and only a caller is missing. The Gap cell names the caller. For auto-add, that caller is the auto-add site feature, which would connect the gateway's player stream to `site/features/auto-add/tracker.ts` and to the add flow. It doesn't exist.
- **Partial** means some logic or copy the rule needs isn't coded. The Gap cell names what's missing.
- **Held** is used for no ID. Every PROVISIONAL rule is first blocked by wiring. The table marks each one's pending live check as "(held)" in its Gap cell, and the list after the table collects them.
- Where 1.x code covers a rule today (for example the consent gate, or the IndexedDB `cachedVideos` deletion), the status describes the 2.0 module and the row mentions the 1.x code.

## Requirements

| ID | Status | Evidence | Gap |
|---|---|---|---|
| YT-GEN-01 | unwired | `shared/features/registry.ts:44` holds the nine www features; names in `public/_locales/en/messages.json:330-360`; `registry.bun-test.ts` | No production startup imports the registry |
| YT-GEN-02 | unwired | `shared/model/defaults.ts:6` all `on: false`; upgraders `background/store/legacy-startup.ts:80`; `model.bun-test.ts`, `legacy-execution.bun-test.ts` | Shipped background still runs 1.x `lib/storage`; no 2.0 first-run, popup or Settings feature switch reaches it |
| YT-GEN-03 | unwired | `background/store/consent-agreement.ts`, registrar gating; `consent-agreement.bun-test.ts`, `registrar.bun-test.ts` | Shipped gate is 1.x `lib/session.ts` `requireConsent`, a different consent model |
| YT-GEN-04 | unwired | Desired set `shared/features/registration.ts:72`, `background/registrar/registrar.ts:55`, Scope disposal; `registration.bun-test.ts`, `registrar.bun-test.ts`, `scope.bun-test.ts` | The `feature-*.js` bundles and the inert probe have no entrypoint |
| YT-GEN-05 | partial | `page/gateway/account.ts:12` pins `DATASYNC_ID`; PageLink hashes it | No "Switch account" link to `channel_switcher` anywhere. PROVISIONAL L7 (held) |
| YT-GEN-06 | unwired | `shared/model/types.ts` Setup vs Settings split; `model.bun-test.ts` | Model not used by shipped code |
| YT-GEN-07 | partial | Tracker `canCount` is false with no taking playlist (`tracker.ts:149`); add flow silent for auto-add without a target | Auto-add site feature that would stay idle doesn't exist |
| YT-GEN-08 | partial | Add flow answers signed out first (`add-flow.bun-test.ts` "signed out answers before any target lookup"); queue button and card menu tests cover signed out | Quick-save, watch-page menu and page picker don't exist to answer |
| YT-GEN-09 | unwired | Lane trip on mismatch `add-flow.ts:397`; test "an account change on the read writes nothing" | No caller |
| YT-GEN-10 | unwired | Private refusals in store edits, private session memory, picker pins; `add-flow-session.bun-test.ts` "private memory never reaches a storage call", picker private tests | No caller |
| YT-GEN-11 | unwired | `registration.ts` `allFrames: false`, music gated by `musicSection` (line 83); `registration.bun-test.ts` | Not registered by the shipped build |
| YT-ITEM-01 | unwired | `site/core/items-www.ts:171` card families; `items-www.bun-test.ts`, `items-www` fixture | No SiteCore composition |
| YT-ITEM-02 | unwired | Ad and collection selectors `items-www.ts:71-75`; test "unsupported cards block current-video fallback" | No caller |
| YT-ITEM-03 | unwired | Test "player contents and end-screen tiles use the current video" | No caller |
| YT-ITEM-04 | unwired | `pointer.ts` hit stack; test "search preview hit order resolves the covered result" | No caller |
| YT-ITEM-05 | unwired | Gateway nav and player reads; test "current playback uses fresh nav and player data" | No caller |
| YT-ITEM-06 | unwired | `site/core/pointer.ts:22`; `pointer.bun-test.ts` focus and pointer order tests | No caller |
| YT-ITEM-07 | partial | `items-www.ts:29` `item-unrecognised` signal; test "failed independent recognition blocks fallback" | YT-BRK-06 copy "Couldn't tell which item you meant…" absent from `messages.json` |
| YT-ITEM-08 | unwired | Settle check `items-www.ts:39` (3 s); monitor anchors; settle boundary tests | No caller |
| YT-AA-01 | unwired | Registration skips off features; progress cleared on off `local-filter-writer.ts:2562`, `consent-agreement.ts:187`; `auto-add-choice.bun-test.ts` | No auto-add bundle or caller |
| YT-AA-02 | partial | Tracker tracks nothing without a taking playlist | Popup's "what's missing" status absent |
| YT-AA-03 | partial | `add-flow.ts:924` `pause`; tracker `paused`; test "Pause stops auto-add in private windows too" | No Pause/Resume control in popup or watch-page button |
| YT-AA-04 | partial | `add-flow.ts:928` `skip`/`unskip`; tracker skips and `recordOutcome` | No "Don't auto-add this video" or "Auto-add this video again" control |
| YT-AA-05 | unwired | Undo and untick set the skip (`add-flow.ts:690`, `:739`); tests "undoing an auto-add skips only that video", "unticking an auto-add playlist … sets the skip" | No caller |
| YT-AA-06 | unwired | Lane trip `add-flow.ts:397` | Auto-add feature missing |
| YT-AA-07 | unwired | Player stream for `movie_player` and `shorts-player`, miniplayer identity (`page/live-reads.ts:75`); `live-reads.bun-test.ts` | Auto-add feature (stream to tracker to add flow) missing |
| YT-AA-08 | unwired | Only counting players, ads, clips (`read-parsers.ts:177`), www-only registry | Same caller missing |
| YT-AA-09 | unwired | `live-reads.ts:75`; `gateway.bun-test.ts` | Same |
| YT-AA-10 | unwired | Gateway nav/player agreement (`page/gateway.README.md` "Player and listener ownership"); tracker rejects other videos | Feature must create one tracker per playback |
| YT-AA-11 | unwired | `clipConfig` parse `read-parsers.ts:177`; tracker `content: "clip"` | Same caller missing |
| YT-AA-12 | unwired | `PLAYBACK_MODE_PAUSED_ONLY` `read-parsers.ts:182`; tracker `made-for-kids` | Caller missing. PROVISIONAL ticket 07 check 7 (held) |
| YT-AA-13 | unwired | Union of stretches `tracker.ts:85`; `tracker.bun-test.ts` | Caller missing |
| YT-AA-14 | unwired | `recordReading` forward-by-(elapsed×rate)+1 s, 1 s gap merge; `tracker.bun-test.ts` | Caller missing |
| YT-AA-15 | partial | Non-playing readings break continuity; `tracker.bun-test.ts` | "Continue watching?" detection not found in the stream |
| YT-AA-16 | unwired | Length disagreement over 2 s gives `cant-measure` (`tracker.ts:65`); `lengthSeconds` parse `read-parsers.ts:68` | Caller missing |
| YT-AA-17 | unwired | `goal` `tracker.ts:141`; `tracker.bun-test.ts` | Caller missing |
| YT-AA-18 | unwired | `evaluateGoals` `tracker.ts:97` | Feature must hand video, title, channel and playlists to `AddFlow.add` |
| YT-AA-19 | unwired | `ad` reading carries no position; position from player | Caller missing |
| YT-AA-20 | unwired | `ad-showing`, `getPresentingPlayerType`, `onAdStart`/`onAdEnd` (`live-reads.ts:92`, `:144`) | Caller missing |
| YT-AA-21 | unwired | `ad-showing` plus the 2 s length rule | Caller missing. PROVISIONAL ticket 07 check 2 (held) |
| YT-AA-22 | unwired | `adClientParams.isAd` `read-parsers.ts:56` | Caller missing. PROVISIONAL ticket 07 check 3 (held) |
| YT-AA-23 | unwired | Paused readings count nothing | Caller missing |
| YT-AA-24 | unwired | Live flags in `canCount` (`tracker.ts:149`), parse `read-parsers.ts:167`; tracker tests | Caller missing |
| YT-AA-25 | unwired | `updateTracker` resets continuity on new facts | Caller missing |
| YT-AA-26 | partial | `takes` in model, `auto-add-choice` `takes` change; tracker `eligible` | No 2.0 popup or Settings control for Videos/Shorts/Both |
| YT-AA-27 | unwired | Tracker `kind`; gateway separates `shorts-player` | Caller must set `kind` from the player |
| YT-AA-28 | partial | Loop wrap is a jump in `recordReading`; parts counted once | Swiping back needs remembered progress, which has no store |
| YT-AA-29 | unwired | `canCount` false when nothing takes Shorts | Caller must not subscribe |
| YT-AA-30 | unwired | `defaults.ts:6` pct 50; `validation.ts:23` 0 to 100 | Caller missing |
| YT-AA-31 | partial | `pct` per playlist, `auto-add-choice` `percentage` change | No 2.0 UI to set it |
| YT-AA-32 | partial | `goal` handles 0 % and 100 % | Copy "As soon as it starts playing" and "Only when watched in full" absent |
| YT-AA-33 | unwired | `updateTracker` settings patch then `evaluateGoals` | Caller must re-evaluate on view change |
| YT-AA-34 | missing | Nothing in 2.0 | Number field and slider save rules unbuilt (shipped popup is 1.x) |
| YT-AA-35 | partial | Tracker `remembered` snapshot; progress shard names `accounts.ts:50`, removal code | No DATA-24 to DATA-29 writer, reader, 30-day expiry or private handling |
| YT-AA-36 | partial | `progress().hasRun` returns `remembered: null` (`tracker.ts:117`) | Stored progress drop needs the missing writer |
| YT-AA-37 | unwired | One run per playlist per tracker; tracker tests | Caller missing |
| YT-AA-38 | partial | Tracker supplies counted %, runs, measurement | No state model, copy ("Auto-adds at…", "Not auto-adding…"), watch-page button or popup status |
| YT-AA-39 | unwired | Auto toasts flagged unasked; toaster defers hidden and fullscreen (`toaster/model.ts:48`); outcomes and site-toaster tests | Caller missing |
| YT-AA-40 | unwired | `toastPlan(report, featureFeedback)` `outcomes.ts:78`; outcomes tests | Caller missing |
| YT-AA-41 | partial | Monitor counts can't-measure (`monitor/thresholds.ts:3`) | Toast copy and once-per-session rule absent from outcomes and `messages.json` |
| YT-AA-42 | partial | `autoAdd.toolbarTick`, `toolbarPaused` settings (`defaults.ts:6`) | No action icon or badge code at all |
| YT-AA-43 | unwired | `legacy.ts:96-104`, `legacy-startup.ts:80`; `legacy.bun-test.ts` | Store startup unwired |
| YT-AA-44 | unwired | `needsSamples` (`tracker.ts:157`); tracker tests | Caller must detach |
| YT-AA-45 | unwired | Tracker counts regardless of visibility; toaster waits while hidden | Caller missing |
| YT-AA-46 | partial | Tracker readings are pure arithmetic | DATA-27 checkpoints missing; Q-PERF-30 never measured |
| YT-CF-01 | unwired | Model `Filter {mode,on,channels}`; `shared/rules/channel-filter.ts:5` | Add flow unwired |
| YT-CF-02 | unwired | `decide` passes when off; `channel-filter-edit.ts:19` keeps list; `channel-filter-edit.bun-test.ts` | Same |
| YT-CF-03 | unwired | `decide` compares IDs only | Same |
| YT-CF-04 | unwired | `decide`; `channel-filter.bun-test.ts` | Same |
| YT-CF-05 | unwired | Test "explicit adds bypass skips and filters" | Same |
| YT-CF-06 | unwired | Test "the session skip precedes filters … nothing is read when nothing remains" | Same |
| YT-CF-07 | unwired | Add flow reads `channelOf` when the add starts | Same |
| YT-CF-08 | unwired | `channelOf` nav, player, then `next`/`reel_item_watch` (`page/gateway/requests.ts:23`) | Same. PROVISIONAL L9 for Shorts (held) |
| YT-CF-09 | unwired | `decide(…, null)` | Same |
| YT-CF-10 | missing | No label comparison or rewrite found | Label refresh and 100/30 cuts unbuilt |
| YT-CF-11 | partial | Mode and on/off change in `local-filter-writer.ts` | Editor UI and hint copy absent |
| YT-CF-12 | partial | `confirmation-required` on a mode change with channels; `channel-filter-edit.bun-test.ts` | Confirm prompt and off-state copy absent |
| YT-CF-13 | missing | None | Empty-allowlist warning and UI absent |
| YT-CF-14 | missing | No list or unlist channel operation in the store | Chips, "Allow {Channel} (this video)" and store op unbuilt |
| YT-CF-15 | missing | None | "This channel" controls unbuilt (store op, popup, watch-page menu) |
| YT-CF-16 | partial | `resolveChannel` via `navigation/resolve_url`, 3 hops (`requests.ts:54`, `answers.ts:58`) | Bare handle refused; offline UC parse with no tab, error copy and field UI absent |
| YT-CF-17 | partial | Filters keyed by playlist in the Setup; private refused; sync refusal in writer | "Remove kept filters" absent |
| YT-CF-18 | partial | Filtered-out, unknown-channel and mixed copy in `messages.json`; outcomes tests | Per-decision console log absent |
| YT-ADD-01 | unwired | `background/add-flow/add-flow.ts:163`; 92 add-flow tests | README: no entrypoint, gateway or picker calls it |
| YT-ADD-02 | unwired | `add-flow.bun-test.ts` "order of checks" block | Same |
| YT-ADD-03 | unwired | Test "settings are captured once per action" | Same |
| YT-ADD-04 | unwired | `shared/rules/outcomes.ts` `Outcome` | Same |
| YT-ADD-05 | unwired | Test "YouTube's duplicate rejection reads as already in" | Same |
| YT-ADD-06 | unwired | Fresh membership per add; shipped `entrypoints/background.ts:17` deletes the IndexedDB cache (`lib/storage.ts:219`, tested in `lib/storage.test.ts`) | Add flow unwired; `localStorage.cachedVideos` removal not found |
| YT-ADD-07 | unwired | Test "unreadable membership: an explicit add goes ahead, auto-add holds" | Same. PROVISIONAL L6 (held) |
| YT-ADD-08 | unwired | Test "a playlist absent from the membership list is still tried" | Same |
| YT-ADD-09 | unwired | Gateway reads `status` (`page/gateway/answers.ts`); `gateway-playlists` fixture | Same |
| YT-ADD-10 | unwired | "membership and the account guard" tests | Same |
| YT-ADD-11 | unwired | Adds go through InnerTube requests, not YouTube's UI commands (`requests.ts`) | Same; no test asserts no YouTube toast |
| YT-ADD-12 | unwired | `toastPlan` feedback flag; site-toaster "feedback off suppresses pending and confirmation" | Per-feature switch UI absent |
| YT-ADD-13 | unwired | `feedback: true` per feature (`defaults.ts`); upgraders `legacy.ts:104` | Same |
| YT-ADD-14 | unwired | `site/kit/toaster/model.ts:24`; site-toaster "sticky notice revives" | Kit not mounted by shipped code |
| YT-ADD-15 | unwired | Outcomes test "saved and failed exposes the failure's fix" | Same |
| YT-ADD-16 | unwired | `Toast.svelte` role alert; site-toaster dom test "roles, glyph rules" | Same; look needs rendering and axe (held) |
| YT-ADD-17 | unwired | Glyph rules in Toast; site-toaster dom test | Same; rendering held |
| YT-ADD-18 | unwired | `shared/copy/index.ts:19` `cut`, `list`; `toast.bun-test.ts` | Same |
| YT-ADD-19 | unwired | 6000 ms, hover and focus pause; site-toaster "pause matrix" | Same |
| YT-ADD-20 | unwired | Hidden slot; site-toaster "one hidden slot keeps newest failure" | Same |
| YT-ADD-21 | unwired | `toaster/model.ts:48`; site-toaster "automatic failures and notices wait in fullscreen" | Same |
| YT-ADD-22 | unwired | `schedulePending` `toaster/model.ts:114`; site-toaster "pending … turns into its outcome in place" | Same |
| YT-ADD-23 | unwired | Gateway 10 s deadline (`page/gateway.README.md`) | Same |
| YT-ADD-24 | unwired | Toaster lives for the page, not the route | Same; no test that a toast survives `yt-navigate` |
| YT-ADD-25 | unwired | Outcomes "auto-add suppression is explicit data" tests | Same |
| YT-ADD-26 | missing | No `console.` call in add flow, site or rules | Outcome logging unbuilt |
| YT-ADD-27 | unwired | Copy in `messages.json`; outcomes and toast tests | Same |
| YT-ADD-28 | unwired | Failure copy; outcomes and toast tests | Same |
| YT-ADD-29 | partial | Try again, Sign in, Reload in outcomes `Action` | `#feature-<id>&playlist=` deep link absent; Choose needs the missing page picker |
| YT-ADD-30 | unwired | Outcomes tests | Same |
| YT-ADD-31 | unwired | Test "Undo removes exactly the entries the action added" | Same |
| YT-ADD-32 | unwired | Undo-failed copy; `toast.bun-test.ts` | Same |
| YT-ADD-33 | unwired | Test "undoing an auto-add skips only that video" | Same |
| YT-ADD-34 | partial | Picker untick, core Undo key | Popup Recent adds list absent |
| YT-ADD-35 | unwired | `failureOf` `outcomes.ts:66`; add-flow tests | Same |
| YT-ADD-36 | unwired | Test "marks follow confirmed answers" | Same |
| YT-ADD-37 | unwired | `PAUSE_MS` (`session-memory.ts:13`); test "a 429 pauses the account for 60 s" | Same |
| YT-ADD-38 | unwired | Test "an account that can't use playlists stops that tab trying" | Same |
| YT-ADD-39 | unwired | `CREATED_MS` `add-flow.ts:150`; test "a just-created playlist waits until it is 30 s old" | Same |
| YT-ADD-40 | unwired | Test "two adds of one tuple make one add" | Same |
| YT-ADD-41 | unwired | `RECENT_MS` `session-memory.ts:12`; test "recent adds read already in for 60 s" | Same |
| YT-ADD-42 | unwired | Test "independent tuples on different tabs progress at once" | Same |
| YT-ADD-43 | unwired | Same-tuple ordering; key repeat ignored (`site/core/keys`); queue-button busy test | Same |
| YT-ADD-44 | unwired | Adds never remove; only picker untick removes | Same |
| YT-ADD-45 | unwired | Test "an untick runs after the pending add of its row" | Same |
| YT-ADD-46 | unwired | Session-only memory; test "private memory never reaches a storage call" | Same |
| YT-PK-01 | unwired | `shared/picker/model.svelte.ts:107` order, search, WL first, New playlist; `ui/picker/PickerPanel.svelte`; 74 picker tests | Page-side popover (`popovers.js`) missing |
| YT-PK-02 | unwired | `FRESH_MS` `model.svelte.ts:84`; test "cached rows paint before membership" | Same |
| YT-PK-03 | unwired | Membership sets checks; picker tests | Same |
| YT-PK-04 | unwired | Tests "a tick shows busy, then …" | Same |
| YT-PK-05 | unwired | Untick tests; add-flow `remove` | Same |
| YT-PK-06 | unwired | Test "unreadable membership leaves the rows unchecked"; copy present | Same |
| YT-PK-07 | unwired | Test "pins go through the source, live keys show" | Same |
| YT-PK-08 | unwired | Pins and private tooltip copy | Same |
| YT-PK-09 | unwired | Choose tests incl. R171 to R173 ("closing while a first pick saves …") | Same; N13 title open |
| YT-PK-10 | partial | Site keys honour an extension-popover blocker (`keys.bun-test.ts` "required menu, dialog and extension popover collaborators") | Esc, outside click, ✕ and hotkey isolation belong to the missing popover |
| YT-PK-11 | partial | Signed-out and refused-account answers in add flow; copy at `messages.json:189` | 5 s load timeout and loader missing |
| YT-PK-12 | missing | None | Placement unbuilt |
| YT-PK-13 | unwired | Test "↻ always reads fresh data" | Same |
| YT-PK-14 | unwired | Sort test; `pickerSortAZ` in Device | Same |
| YT-NEW-01 | unwired | Picker creates with the item, chooser creates empty; picker tests | Popover and Settings choosers missing |
| YT-NEW-02 | unwired | `titleProblem` `model.svelte.ts:100`; test "titles are trimmed, required, at most 150" | Same. PROVISIONAL title limit (held) |
| YT-NEW-03 | unwired | `newPlaylistVisibility`; test "a private window … never stores the last visibility" | Same |
| YT-NEW-04 | unwired | `titleCheck.duplicate`; copy present | Same |
| YT-NEW-05 | unwired | `CreateState` pending | Same |
| YT-NEW-06 | unwired | `CREATED_PLAYLIST_MS` `account-cache.ts:31` | Same |
| YT-NEW-07 | partial | Failure reasons and most copy | **Create channel** link to `create_channel` absent |
| YT-KEY-01 | unwired | Model `shortcuts` settings; 20 cap | No www shortcuts feature |
| YT-KEY-02 | partial | `applyPresets` `shared/keys/bindings.ts:92`; preset tests | "No key: {Key} is used by {Other}" row copy absent |
| YT-KEY-03 | partial | In-page listener only | Settings note copy absent |
| YT-KEY-04 | partial | Picker key binding | www shortcuts feature and page picker missing |
| YT-KEY-05 | unwired | Alt+U default; core Undo (`site/core/keys.ts:69`); `keys.bun-test.ts:335` | Settings › Everywhere absent |
| YT-KEY-06 | missing | Manifest (`wxt.config.ts`) declares no commands | Popup command and its Settings link unbuilt |
| YT-KEY-07 | unwired | Model; `setup-edit.ts` shortcut targets | Same |
| YT-KEY-08 | partial | Store refuses past 20 (`key-settings.ts:50`) | Disabled button and copy absent |
| YT-KEY-09 | missing | None | Settings list UI unbuilt |
| YT-KEY-10 | unwired | Engine test "clear leaves the shortcut, label, Watch Later choice" | Settings UI absent |
| YT-KEY-11 | partial | Remove with 6 s receipt (`contracts/key-settings.ts:26`) | Inline "Shortcut removed · Undo" absent |
| YT-KEY-12 | unwired | `watchLaterChosen` `setup-edit.ts:147`; WL change in key settings | Same |
| YT-KEY-13 | partial | No-playlist hint and Choose action in outcomes | Choose needs the page picker |
| YT-KEY-14 | unwired | Label trim 40 (`key-settings.ts:65`); fallback `ui/keys/client.ts:69` | Same |
| YT-KEY-15 | partial | `when: s => s.shortcuts.music` in registry; access request `ui/backend/browser.ts` | FT-52 denied flow and row UI absent |
| YT-KEY-16 | partial | Items and Pointer resolution tested | www shortcuts feature missing |
| YT-KEY-17 | partial | Resolution cases tested in `items-www.bun-test.ts` | "Point at a video…", "Only videos can be saved…", "Ads can't be saved." absent |
| YT-KEY-18 | unwired | Explicit adds bypass filters | Same |
| YT-KEY-19 | unwired | `site/core/keys.ts:69` typing, IME, menus, repeat, pending; tests | Same |
| YT-KEY-20 | unwired | `shared/keys/match.ts:28`; `engine.bun-test.ts`, `review-regressions.bun-test.ts` | Same |
| YT-KEY-21 | unwired | Test "matching keys suppress later listeners" | Same |
| YT-KEY-22 | unwired | `findConflicts` `bindings.ts:42`; tests | Same |
| YT-KEY-23 | unwired | `isReserved`, `shortcutWarnings` (`policy.ts:49`, `:69`); tests | Same |
| YT-KEY-24 | partial | Add flow and toaster pending | www shortcuts feature missing |
| YT-KEY-25 | unwired | Core Undo; "Nothing to undo." (`messages.json:2859`); site-toaster "real core Undo key and button share one in-flight action" | Same |
| YT-KEY-26 | partial | Monitor statuses | Feature that keeps keys caught and answers is missing |
| YT-KEY-27 | unwired | `display` `policy.ts:118`; `KeyRecorder.svelte` × | Settings unwired; no render test |
| YT-KEY-28 | unwired | `recorder.ts:11`; "Press keys…", "Esc to cancel" (`ui/keys/controller.ts:30`); `key-settings/recorder.bun-test.ts` | Same |
| YT-KEY-29 | partial | Hints `controller.ts:34-37` | Reserved hint reads "This is the browser's own key…", not "{Key} is …" |
| YT-KEY-30 | unwired | Conflict dialog, Use it here; engine test | Same |
| YT-KEY-31 | partial | Warning copy in `KeyRecorder.svelte` | No `commands.getAll` source; manifest has no commands |
| YT-KEY-32 | unwired | `key-settings-execution.ts:46`; TabView publication | Same |
| YT-KEY-33 | unwired | `legacy-shortcut.ts:16`; `legacy.bun-test.ts` | Store startup unwired |
| YT-KEY-34 | partial | Picker rows show live keys | Quick-save ▾ and watch-page menu missing |
| YT-QS-01 | partial | `quickSave {on, feedback, shortsShelves}` in defaults; registry entry | Feature code missing |
| YT-QS-02 | missing | None | Split button unbuilt |
| YT-QS-03 | partial | Setup `quickSave`; setup-edit destination; picker pin and choose | Button missing |
| YT-QS-04 | partial | Picker choose mode | Button missing |
| YT-QS-05 | partial | Add flow explicit path | Button missing |
| YT-QS-06 | missing | None | States unbuilt |
| YT-QS-07 | partial | Outcomes Choose action for quick-save | Button and page picker missing |
| YT-QS-08 | partial | Refusal copy and handling in add flow | Button missing |
| YT-QS-09 | partial | Signed-out answer in add flow | Button missing |
| YT-QS-10 | partial | Items has a `shorts` family; queue button refuses Shorts (test "gets no queue button") | Quick-save side missing |
| YT-QS-11 | partial | Shared overlay moves into the preview layer (queue-button test "search's inline preview takes the host") | Quick-save side missing |
| YT-QS-12 | partial | Monitor plus `notices.wouldAct` pattern | Quick-save side missing |
| YT-Q-01 | unwired | `queueButton.feedback: true`; registry | SiteCore services not wired (status.md) |
| YT-Q-02 | unwired | `site/features/queue-button/feature.ts:234`; gateway `queueAdd`; `queue-button.bun-test.ts` | Same |
| YT-Q-03 | unwired | Test "signed out with absent account keys still adds" | Same |
| YT-Q-04 | unwired | `recheckAfterMs` 150/900 (`feature.ts:31`); recheck tests | Same |
| YT-Q-05 | unwired | Quiet route in `page/gateway/www-queue.ts`; test "a noisy confirmed add stands without our toast" | Same. PROVISIONAL ticket 29 Q1 to Q8 (held) |
| YT-Q-06 | unwired | Confirmed vs unconfirmed (`queue-button/model.ts`); tests | Same. PROVISIONAL L8 (held) |
| YT-Q-07 | unwired | State table; `failedForMs` 1500; tests | Same |
| YT-Q-08 | unwired | Toasts per G6; untitled tests | Same |
| YT-Q-09 | unwired | Exact-entry Undo; Undo-key test | Same. PROVISIONAL ticket 29 (held) |
| YT-Q-10 | unwired | Test "not working draws nothing and asks for the notice once" | Same |
| YT-WB-01 | partial | `watchButton {on, feedback, shorts}`; registry `:83` | Feature code missing |
| YT-WB-02 | missing | None | Placement and re-placement unbuilt |
| YT-WB-03 | missing | None | Label and pie unbuilt |
| YT-WB-04 | missing | None | Fold logic unbuilt |
| YT-WB-05 | missing | None | Shorts placement unbuilt |
| YT-WB-06 | missing | None | Unbuilt |
| YT-WB-07 | missing | None | Menu unbuilt |
| YT-WB-08 | missing | None | Unbuilt |
| YT-WB-09 | missing | None (add-flow failure toasts exist to reuse) | Rows unbuilt |
| YT-WB-10 | missing | None | Unbuilt |
| YT-WB-11 | missing | None | Unbuilt |
| YT-CM-01 | unwired | `cardMenu.keepLinkMenu: false`; feature reads it live (test "keepLinkMenu preserves the video's own links") | SiteCore services not wired |
| YT-CM-02 | unwired | `decideCardMenu` `card-menu.ts:53`; gateway `openCardMenu` (`page/gateway.ts:154`); tests | Same |
| YT-CM-03 | unwired | Browser-menu cases tested; Shift test | Same |
| YT-CM-04 | unwired | Test "signed out and with absent account setup the card menu still opens" | Same |
| YT-CM-05 | unwired | Kit-free notice tests; G15 budget 1.25 KB | Same; bundle size never measured |
| YT-BRK-01 | unwired | `background/monitor/monitor.ts:30`, `derive.ts:95`; `monitor.bun-test.ts` | Production bindings absent (monitor README) |
| YT-BRK-02 | unwired | Batching at 60 ms, once, visible tab (monitor tests); `site/core/notice/plain.ts:38` Details; batched copy `messages.json:2868` | Same |
| YT-BRK-03 | partial | Explicit failure toasts in add flow and queue button | Shortcuts feature missing |
| YT-BRK-04 | unwired | `MONITOR_CANNOT_MEASURE = 3`; test "cannot-measure is partial until the third playback" | Same |
| YT-BRK-05 | unwired | Test "core failure stops the site while missing account keys preserve queue actions" | Same |
| YT-BRK-06 | partial | Batched feature copy and watch-page line | Auto-add, queue, card menu, unrecognised item, account keys and whole-site lines absent |
| YT-BRK-07 | partial | `site/core/notice/skin.ts` var fallbacks with `:host([dark])` | Diagnostics record of the fallback not found |
| YT-ANY-01 | partial | Registry `:128` keys-only; `anyTabKeys` defaults | Feature code missing |
| YT-ANY-02 | missing | Manifest declares no commands | Unbuilt |
| YT-ANY-03 | missing | None | Settings › Everywhere listing unbuilt |
| YT-ANY-04 | partial | Tabs skip discarded, then active, then recent (`tabs/tabs.ts:103`, `:255`) | Audible step and per-command choice absent |
| YT-ANY-05 | partial | Add flow explicit add to WL | Command handler missing |
| YT-ANY-06 | missing | None | 3 s badge and tooltip unbuilt |
| YT-ANY-07 | partial | Registrar `ensure(tabId, what)` on-demand injection | No command handler; manifest entries absent |
| YT-ANY-08 | missing | Access request plumbing only | Command gates unbuilt |
| YT-ANY-09 | partial | Tabs filter by privacy | Command handler missing |
| YT-BM-01 | partial | Registry `:96`; `browserMenu` defaults | Feature code missing |
| YT-BM-02 | missing | No `contextMenus.create` | Unbuilt |
| YT-BM-03 | missing | None | Unbuilt |
| YT-BM-04 | partial | Add flow explicit path | Menu handler missing |
| YT-BM-05 | missing | None | Unbuilt |
| YT-BM-06 | partial | Add-flow toasts, own feedback default | Menu handler missing |
| YT-BM-07 | partial | Request and release (`ui/backend/browser.ts:17`, `background/adapters/shared-settings.ts:11`) | Manifest lacks optional `contextMenus`; held state UI absent |
| YT-BM-08 | partial | Registrar on-demand injection | Caller missing |
| YT-BM-09 | missing | None | Unbuilt |
| YT-GT-01 | partial | `gather` settings model, registry `:102`, first-run row (`ui/onboarding/features.ts:24`) | Popup row and Settings card absent |
| YT-GT-02 | unwired | `background/gather/gather.ts:96`; `gather-controller` fixture | Execution adapter, `ui.gather*` routes and composition missing (status.md) |
| YT-GT-03 | unwired | `videoOf` `shared/rules/gather.ts:88`; `gather.bun-test.ts` | Same |
| YT-GT-04 | unwired | `videoOf`; tests | Same |
| YT-GT-05 | unwired | Native port reads address, title, place, access time only | Same |
| YT-GT-06 | unwired | Window filter `gather.ts:152` | Same |
| YT-GT-07 | unwired | Dedup in order; fixture | Same |
| YT-GT-08 | unwired | `order` `shared/rules/gather.ts:115`; tests | Same |
| YT-GT-09 | unwired | `languageTitle` `rules/gather.ts:111`, language port | Same |
| YT-GT-10 | unwired | Shuffled order | Same |
| YT-GT-11 | unwired | Three destinations | Same |
| YT-GT-12 | unwired | `PLAYER_LIMIT` 50 | Same |
| YT-GT-13 | unwired | Over 50 goes to queue (`why: "player-takes-50"`) | Same |
| YT-GT-14 | unwired | `GATHER_LIMIT` 200, 10 s load | Same. PROVISIONAL G3 (held) |
| YT-GT-15 | unwired | `AddFlow.batch` | Same |
| YT-GT-16 | partial | Setup `gather` destination, private refusal | Chooser prompt copy and UI absent |
| YT-GT-17 | unwired | Close-after-confirmation `gather.ts:182` | Same |
| YT-GT-18 | unwired | Batch tests "gather order, fresh membership per video, chunks of at most 50" | Same. PROVISIONAL G1, G2 (held) |
| YT-GT-19 | partial | One report shape | Progress and result copy absent; popup row missing |
| YT-GT-20 | partial | Batch failure tests | "Tries the next serving tab" and popup Try again absent |
| YT-GT-21 | partial | Undo reopen, five kept gathers; batch Undo tests | `activated` seam has no caller (gather README) |
| YT-GT-22 | missing | None (status.md: not started) | Unbuilt |
| YT-GT-23 | missing | None | Unbuilt |
| YT-GT-24 | missing | None | Unbuilt. PROVISIONAL G6 |
| YT-GT-25 | missing | None | Unbuilt |
| YT-GT-26 | missing | Only the `kept` set exists | Unbuilt |
| YT-GT-27 | missing | None | Unbuilt |
| YT-GT-28 | missing | None | Unbuilt |
| YT-GT-29 | missing | None | Unbuilt |
| YT-GT-30 | unwired | Private gathers stay in memory (gather README) | Same as GT-02 |
| YT-GT-31 | missing | None (status.md: feedback not started) | Unbuilt |
| YT-GT-32 | missing | Copy absent from `messages.json` | Unbuilt |
| YT-GT-33 | missing | Copy absent | Unbuilt |
| YT-GT-34 | missing | None | Popup Enter unbuilt |
| YT-GT-35 | missing | None | Credit absent |
| YT-GT-36 | partial | `no-effect` signal `gather.ts:237`; monitor test "Gather failures name destinations" | Destination-not-working copy absent |

Held live checks inside unwired or partial rows: L6 (YT-ADD-07), L7 (YT-GEN-05), L8 (YT-Q-06), L9 (YT-CF-08), ticket 07 checks 2, 3 and 7 (YT-AA-21, YT-AA-22, YT-AA-12), ticket 29 Q1 to Q8 (YT-Q-05, YT-Q-09), G1 and G2 (YT-GT-18), G3 (YT-GT-14), G6 (YT-GT-24), and the title limit (YT-NEW-02). Rendering and axe are held for YT-ADD-16 and YT-ADD-17. No bundle has been built, so G15's 1.25 KB card-menu budget (YT-CM-05) has never been measured.

## Work to do

Units are ordered by dependency. Sizes: S is under a day, M is a few days, L is a week or more. Each unit lists the IDs it closes, including the unwired IDs that need only its wiring.

### W1. Background composition cutover (L)

- **IDs:** YT-GEN-01 to 04, 06, 09 to 11; YT-AA-01, 05, 06, 43; YT-ADD-01 to 13, 23, 25, 27, 28, 30 to 33, 35 to 46; YT-CF-01 to 09; YT-KEY-07, 12, 14, 18, 32, 33; YT-BRK-01, 02, 04, 05; YT-GT-02 to 15, 17, 18, 30.
- **Work:** Replace the 1.x message handler with the 2.0 store owner and its startup, including the legacy migration. Compose Tabs, Registrar with `shared/features/registry.ts`, Monitor with the TabView producer and publication, Playlists, AddFlow with its execution port, the routers (`ui-playlists`, `first-run`, `shared-settings`, `clear-all`), and Gather with `background/gather/execution.ts`.
- **Files:** `src/entrypoints/background.ts`, `wxt.config.ts`, `src/background/**`.
- **Depends on:** nothing. Every other unit depends on it.

### W2. Site core and page bundles (L)

- **IDs:** YT-GEN-04 (bundles), YT-ITEM-01 to 06, 08; YT-ADD-14 to 22, 24; YT-KEY-19 to 23, 25; YT-Q-01 to 10; YT-CM-01 to 05; YT-BRK-02, 05.
- **Work:** Build the isolated www content entry and the page-world gateway entry. They compose PageLink, ExtLink, FeatureHost, Scope, Pointer, `WwwItems`, Keys, the notice, and the kit (toaster, overlay, layer host). Emit the `feature-*.js` and `popovers` bundle names that `shared/features/registration.ts` plans. Bind the SiteCore services that the queue button and card menu need (status.md lists them as not wired). Measure G15's card-menu budget once bundles exist.
- **Files:** `src/entrypoints/youtube.content.tsx` (replaced), new page and feature entrypoints, `src/site/**`, `src/page/**`.
- **Depends on:** W1.

### W3. Auto-add site feature and watch progress (L)

- **IDs:** YT-AA-02 to 04 (state source), 07 to 33, 35 to 41, 44 to 46; YT-GEN-07.
- **Work:**
  - Add a `feature-auto-add` definition that keeps one tracker per playback from the `player` and `nav` streams.
  - It calls `evaluateGoals`, then `AddFlow.add` with the title and channel, and `recordOutcome`.
  - It detaches when `needsSamples` is false and re-evaluates when the view changes.
  - Detect YouTube's "Video paused. Continue watching?" for YT-AA-15. Nothing in the stream reads it today.
  - Build the DATA-24 to DATA-29 progress writer and reader: 16 shards, 30-day expiry, tab-only in private windows, dropped on a length change, DATA-27 checkpoints.
  - Add the can't-measure toast with its once-per-session rule, and the YT-AA-38 state model that the popup and the watch-page button read.
- **Files:** new `src/site/features/auto-add/feature.ts`, a new progress module under `src/background/store/`, `src/page/live-reads.ts`, `src/shared/rules/outcomes.ts`, `src/shared/copy/`.
- **Depends on:** W1, W2.

### W4. Page-side playlist picker (M to L)

- **IDs:** YT-PK-01 to 14; YT-NEW-01 to 07 (page side); YT-ADD-29 (Choose); YT-KEY-13; YT-QS-04, 07.
- **Work:**
  - Build the `popovers` bundle, which mounts `ui/picker/PickerPanel.svelte` in the page through the kit.
  - Give it a page `PickerSource` over PageLink and the background playlists.
  - Add YT-PK-12 placement, and closing on Esc, an outside click and ✕.
  - Block shortcuts and YouTube hotkeys while it's open, using the blocker that `site/core/keys` already honours.
  - Add the 5 s load-failure toast, and choose mode for quick-save, a shortcut and the browser menu.
  - Add the **Create channel** link (YT-NEW-07).
- **Files:** new popover entry, `src/ui/picker/`, `src/shared/picker/source.ts`, `src/site/kit/`.
- **Depends on:** W1, W2. Question 1 blocks the shortcut-Choose title.

### W5. Playlist shortcuts on YouTube (M)

- **IDs:** YT-KEY-01, 04, 16, 17, 24, 26; YT-ITEM-07; YT-BRK-03; YT-GEN-08 (shortcut part).
- **Work:**
  - Add a `feature-shortcuts-www` definition that registers each shortcut and the picker key with Keys.
  - Resolve the pointed-at item, else the current video, with the three YT-KEY-17 answers and YT-BRK-06's unrecognised-item toast.
  - Run explicit adds with the 1 s pending toast, open W4 for the picker key, and keep keys caught when the feature isn't working.
- **Files:** new `src/site/features/shortcuts/`, `src/public/_locales/en/messages.json`.
- **Depends on:** W2, W4.

### W6. Quick-save on thumbnails (M)

- **IDs:** YT-QS-01 to 12; YT-KEY-34 (▾ tooltip); YT-GEN-08 (quick-save part).
- **Work:** Add a split button on the shared overlay. Its states are busy, done for 1.5 s, then saved for the page view, or failed for 1.5 s. It needs choose mode with no playlist, the "On Shorts shelves too" option, the preview layer, the ▾ key hint, and the not-working notice. `site/features/queue-button/` is the nearest model to copy.
- **Files:** new `src/site/features/quick-save/`.
- **Depends on:** W2, W4.

### W7. Watch-page button (L)

- **IDs:** YT-WB-01 to 11; YT-AA-03, 04 (controls), 38 (display); YT-CF-15 (menu side); YT-KEY-34 (menu row).
- **Work:**
  - Place the button after Share and before Save, and re-place it after navigation with bounded retries.
  - Fold it before YouTube's own fold logic runs, with a synthetic `resize` on a narrow first load.
  - Add the Shorts column option, the label and pie, the menu rows, and the flip. Hide it in the miniplayer and in fullscreen.
- **Files:** new `src/site/features/watch-button/`.
- **Depends on:** W2, W3, W4, W9.

### W8. Extension pages for the YouTube features (L)

- **IDs:**
  - YT-AA-02, 26, 31, 32, 34.
  - YT-ADD-12 (switch UI), 29 (Settings deep link), 34 (Recent adds).
  - YT-KEY-02, 03, 05, 08 to 11, 15, 27.
  - YT-CF-11 to 13; YT-GT-01, 16; YT-ANY-03.
- **Work:** Build the Svelte popup and Settings › YouTube and › Everywhere to replace the React 1.x pages:
  - feature switches and Show feedback;
  - auto-add playlists with Takes and the percentage, with YT-AA-34's field and slider save rules;
  - This video, with Pause and Skip;
  - Recent adds;
  - the quick-save and gather choosers;
  - the shortcut list: add, record, label, Watch later on every account, remove with inline Undo, the 20 cap, and the preset's no-key row;
  - the undo key, the popup-key link, the any-tab key list, and `#feature-<id>&playlist=` deep links.

  This overlaps chapters 04 and 05, which own these surfaces.
- **Files:** `src/entrypoints/popup/`, `src/entrypoints/options/`, `src/ui/`.
- **Depends on:** W1.

### W9. Channel filter completion (M)

- **IDs:** YT-CF-10 to 18.
- **Work:**
  - Add a store operation that lists or unlists one channel, with YT-CF-15's turn-on and confirm flows.
  - Refresh labels on read, cutting titles at 100 and handles at 30.
  - Add "Remove kept filters" and the editor chips.
  - Accept a bare handle in `channelUrl` (`page/gateway/requests.ts:54`). Today it refuses one.
  - Parse UC IDs offline when no YouTube tab is open, and add the two error lines.
  - Log each filter decision to the tab's console.
- **Files:** `src/background/store/local-filter-writer.ts` or a new channel-edit module, `src/page/gateway/requests.ts`, `src/shared/copy/`, `messages.json`.
- **Depends on:** W1. The UI lands through W8 and the menu chips through W7.

### W10. Toolbar icon (S to M)

- **IDs:** YT-AA-42; YT-ANY-06; YT-GT-31 (✓ and ✕).
- **Work:** Show the teal tick and the slate "II" with their priority under "!", and the 3 s ✓ or ✕ with a tooltip. No action-icon code exists today.
- **Files:** a new background module under `src/background/`.
- **Depends on:** W1.

### W11. Keys from any tab (M)

- **IDs:** YT-ANY-01 to 09; YT-KEY-06, 31.
- **Work:**
  - Declare the three commands and `_execute_action` in the manifest, with no keys.
  - Add a command handler gated on the feature, consent and the music section.
  - Choose the tab per YT-ANY-04. Tabs lacks the audible step.
  - Inject on demand through `registrar.ensure`, and run the Watch later explicit add.
  - Add a `commands.getAll` source for the recorder warning and the Settings list.
- **Files:** `wxt.config.ts`, a new background module, `src/background/tabs/tabs.ts`, `src/ui/keys/`.
- **Depends on:** W1, W2, W10.

### W12. Save from the browser's menu (M)

- **IDs:** YT-BM-01 to 09.
- **Work:**
  - Add optional `contextMenus` to the manifest. Create the menu when the feature switches on and remove it when it switches off. The permission request and release code already exists.
  - Add the three items, targeting the link's video, else the current video.
  - Handle the card menu interplay, run the add through the add flow, open choose mode through W4, inject on demand, and handle private windows.
- **Files:** `wxt.config.ts`, a new background module, `src/background/adapters/shared-settings.ts`.
- **Depends on:** W1, W2, W4.

### W13. Gather completion (L)

- **IDs:** YT-GT-01, 16, 19 to 29, 31 to 36.
- **Work:**
  - Add the `ui.gather*` routes, and a popup row with progress, results, Last gather, Try again and Undo.
  - Show the toast and badge results after the popup closes, and try the next serving tab on an account change.
  - Build the automatic triggers: wake points, background-opened tabs, the N-tab window, bursts, per-window pacing, the serving-tab order, lasting-failure exclusion, and a caller for the `activated` seam.
  - Add the YT-GT-32, 33 and 36 copy, Enter in the popup, and the GatherTube credit.
- **Files:** `src/background/gather/`, `src/background/router/`, the popup and Settings from W8, `messages.json`.
- **Depends on:** W1, W8, W10.

### W14. Copy and small gaps (S)

- **IDs:** YT-GEN-05, YT-ADD-06, YT-ADD-26, YT-KEY-29, YT-BRK-06, YT-BRK-07, plus the copy parts of YT-AA-32, 38, 41, YT-CF-11 to 16, YT-KEY-02, 03, 08, 11, 17, YT-NEW-07 and YT-GT-32, 33.
- **Work:**
  - Add the strings missing from `messages.json`, as each row in the table names them.
  - Change the reserved-key hint to start with `{Key}`.
  - Add the "Switch account" link to `https://www.youtube.com/channel_switcher`.
  - Log add outcomes to the console.
  - Remove `localStorage.cachedVideos`.
  - Record the theme fallback in Diagnostics.
- **Files:** `src/public/_locales/en/messages.json`, `src/shared/i18n/parameters.ts`, `src/shared/copy/`, `src/ui/keys/controller.ts`, `src/site/core/notice/`.
- **Depends on:** none for the strings. Each unit above uses its own.

## Questions

1. **N13, choose mode opened from a shortcut's Choose.** The chapter's "Not pinned down" section says no wording exists for the picker's title and subtitle in this case. "Save videos to…" and "One click will save here from now on." fit only the quick-save playlist (YT-PK-09, YT-KEY-13). This blocks W4's and W5's copy.
2. **The shape of the cutover.** The 1.x background owns `storage.local` through `src/lib/storage.ts`, and the 2.0 store owns the same areas. Two options are open. W1 and W2 could replace both entrypoints in one step, or the 2.0 modules could ship behind the 1.x entrypoints feature by feature. The order of W1 to W13 depends on which.
3. **The 237 uncommitted changes in `t3-8e91ff1c`.** status.md says their relation to `2.0/compose-units` hasn't been checked. They touch the store files W1 would compose, such as `local-filter-writer.ts`, `sync-join-execution.ts` and `account-removal-execution.ts`. Do they land before W1 starts?
