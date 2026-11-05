# Requirement pass: 03 YouTube Music and 09 Parity

Commit `f7898dcc8` on `2.0/compose-units`. Inspect only. No test was run for this pass; test names are cited from the files.

## Summary

Chapter 03 defines 205 IDs: 0 built, 0 untested, 45 unwired, 79 partial, 75 missing, 0 external, 6 held. Chapter 09 has 213 rows. PAR-NEW-34 is declined and out of scope, which leaves 212: 10 built, 0 untested, 96 unwired, 73 partial, 30 missing, 1 external, 2 held. No YouTube Music behaviour reaches a user today. The pure layers are written and tested: Music item recognition, the key engine, the toaster, the add flow with Music save and unsave, the picker model, the registry, Monitor and the settings planner. What's missing is everything that would run them on music.youtube.com: a Music page bundle, SiteCore assembly, the queue, like, library and navigate routes (`src/page/routes/music.ts:12-13` leaves them empty), the Music page features, the in-page picker, a 2.0 popup and Settings, the badge and any-tab commands. Most built parity rows are retirements the interim build already completed.

**The finding that decides most rows.** The shipped extension is still the interim 1.5.0 build. `wxt.config.ts:33` names it "YouTube Playlist Tools", grants only `https://www.youtube.com/*` on both browsers, and declares no `commands` and no optional permissions. The four entrypoints in `src/entrypoints/` reach 57 files (computed by walking their imports). They are the React popup and options page, `src/lib/*`, `src/components/*`, `src/shared/model/*`, `src/page/youtube-session.ts` and one 2.0 module, `src/background/adapters/sender-origin.ts`. Nothing under `src/site/`, `src/ui/`, `src/background/{store,add-flow,gather,monitor,registrar,tabs,playlists,accounts,router,tab-view}`, `src/page/gateway*` or `src/shared/{keys,features,rpc,copy,rules,picker}` is reached. No `page-music`, `core-music`, `kit-music`, `feature-music-actions`, `feature-music-keys` or `feature-shortcuts-music` bundle exists. So no YouTube Music requirement can be **built**: the best a Music row gets is **unwired**. `scripts/check-manifests.sh:31` also asserts `host_permissions == ["https://www.youtube.com/*"]`, which would fail the 2.0 Firefox manifest (`*://*.youtube.com/*`, ARC-MAN-02) and any Chrome build with optional Music access.

**How parity rows are judged.** A 09 row is judged on whether the 2.0 build delivers the row's 2.0 column. Where the interim entrypoints still deliver the old 1.x form, the Evidence cell says "interim keeps 1.x" and the row is not counted as built. Retirements the interim already completed (OAuth, tokens, the broker, the IndexedDB cache) count as built.

## Legend for the Evidence column

| Short | Path |
| --- | --- |
| IM / IMT | `src/site/core/items-music.ts` / `items-music.bun-test.ts` |
| RP | `src/page/read-parsers.ts` |
| RM / RW | `src/page/routes/music.ts` / `src/page/routes/www.ts` |
| GW / GWT | `src/page/gateway.ts` / `src/page/gateway.bun-test.ts` |
| GPF | `tools/fixtures/gateway-playlists/` |
| GQF | `tools/fixtures/gateway-www-queue/gateway.bun-test.ts` |
| AF / AFT | `src/background/add-flow/add-flow.ts` / `add-flow.bun-test.ts` |
| PK / PKT | `src/shared/picker/model.svelte.ts` / `model.bun-test.ts` |
| PT | `src/ui/picker/text.ts` |
| KB / KP / KE | `src/shared/keys/bindings.ts` / `policy.ts` / `engine.bun-test.ts` |
| SK / SKT | `src/site/core/keys.ts` / `keys.bun-test.ts` |
| KR | `src/ui/keys/KeyRecorder.svelte` |
| TM / TMT / TDT | `src/site/kit/toaster/model.ts` / `tools/fixtures/site-toaster/model.bun-test.ts` / `dom.bun-test.ts` |
| FB | `src/site/kit/feedback/index.ts` |
| MD / MT / MTH | `src/background/monitor/derive.ts` / `monitor.bun-test.ts` / `thresholds.ts` |
| REG / RGN / RGNT / RGT | `src/shared/features/registry.ts` / `registration.ts` / `registration.bun-test.ts` / `registry.bun-test.ts` |
| RR / RRT | `src/background/registrar/registrar.ts` / `registrar.bun-test.ts` |
| FS / FST / FSB | `src/background/store/feature-settings.ts` / `tools/fixtures/feature-switches/owner.bun-test.ts` / `boundaries.bun-test.ts` |
| DEF / TY | `src/shared/model/defaults.ts` / `types.ts` |
| TABS | `src/background/tabs/tabs.ts` |
| PL | `src/background/playlists/playlists.ts` |
| TR / TRT | `src/site/features/auto-add/tracker.ts` / `tracker.bun-test.ts` |
| CF | `src/shared/rules/channel-filter.ts` (+ `.bun-test.ts`) |
| QB / CM | `src/site/features/queue-button/` / `src/site/features/card-menu/` |
| GA / GAF / GR | `src/background/gather/gather.ts` / `tools/fixtures/gather-controller/` / `src/shared/rules/gather.ts` |
| LG | `src/background/store/legacy.ts` (+ `legacy.bun-test.ts`) |
| ONB | `src/ui/onboarding/` |
| MSG | `src/public/_locales/en/messages.json` (key names) |
| INT | the interim entrypoints `src/entrypoints/*` and `src/lib/*` |

"No Music feature" below means the missing `music-actions` / `music-keys` page features and SiteCore assembly (unit U1/U2). "No 2.0 popup" and "no 2.0 Settings" mean `src/ui` holds only the first-run page, the picker panel and the key recorder.

## Chapter 03: YouTube Music

| ID | Status | Evidence | Gap |
|---|---|---|---|
| YM-FEAT-1 | partial | Off by default DEF:15; planner refuses without access FS:34; first-run lists it ONB/features.ts | No 2.0 popup or Settings switch; store unwired |
| YM-FEAT-2 | unwired | Defaults match spec DEF:15-19; shape TY:58-61 | Nothing reads them on Music; no Settings list |
| YM-FEAT-3 | unwired | DEF:20-24 keys null, feedback on; undo key top-level DEF:6 | No Music key feature |
| YM-FEAT-4 | partial | `Setup.musicSave` DEF:34 | Settings row shown under either feature missing |
| YM-FEAT-5 | partial | `musicSection` gates registration RGN:83 (RGNT:48) and keys KB:29 (KE:175) | Popup and Settings switch, hatched "YouTube Music is off" missing |
| YM-FEAT-6 | partial | Plan registers nothing on Music when gated RGN:83 | On-demand Playing now probe and any-tab injection missing |
| YM-FEAT-7 | partial | Per-feature files and lazy `popovers` REG:110-125; popovers on use RRT:293 | Hover-intent picker preload missing; Music feature files missing |
| YM-FEAT-8 | partial | Feature host starts/stops on view (`src/site/core/feature-host.ts`); registrar updates RRT:65 | No Music feature to add or remove elements |
| YM-FEAT-9 | unwired | Preset once KB:94, FS:61-65; four new actions unbound KE:277; deleted presets stay KE:297; FST:167 | Store not reached |
| YM-FEAT-10 | partial | Denied switch stays off FST:51; first-run held FSB:93,144; `firstRun_finish_noMusicAccess` MSG; `addHostAccessRequest` in `src/background/adapters/registrar.ts` | No optional Music host permission in manifest; R71 copy "No access to YouTube Music…" missing; no badge (no `setBadge*` anywhere) |
| YM-FEAT-11 | unwired | No consent selects nothing RGN `desired` (RGNT:44) | Registrar unwired |
| YM-ACC-1 | unwired | Music settings are shared Settings fields TY:57-65; sync store modules | Store and sync unwired |
| YM-ACC-2 | unwired | `musicSave` per Setup DEF:34 | Store unwired; `DATASYNC_ID` stability is held (ticket 25) |
| YM-ACC-3 | partial | Account read route RM:7; per-page lane pin in AF (README "Ports") | No Music page bundle reads ytcfg; app window untested |
| YM-ACC-4 | unwired | Missing target opens Choose AFT:122; pick stores choice PKT:279 | Store and picker unwired |
| YM-ACC-5 | partial | Signed-out check first AFT:113; `feedback_music_*_signed_out_one` MSG | Like and library sign-in copy missing; no buttons to hide |
| YM-ACC-6 | partial | Music responses always guarded GW:191; tab refuses after mismatch AFT:185; copy `…account_changed…` MSG | Like/library paths missing; Reload action unwired; M2 held |
| YM-ACC-7 | partial | Monitor takes account-key facts (MD; monitor README) | Button hiding, per-press answer and "Saving isn't working…" copy missing |
| YM-ACC-8 | unwired | Private first pick PKT:391; private pins `picker_privatePin` PT:15; private memory in AF | Store and picker unwired |
| YM-QA-1 | partial | Menu endpoints matched by command RP:283-321; availability IM:162-182 | Menu not read on pointer arrival; no buttons |
| YM-QA-2 | partial | "Only songs can be saved" IM:168; IMT:47 | No buttons; key path unwired |
| YM-QA-3 | partial | Remove only on queue items IM:163; IMT:289 | No buttons |
| YM-QA-4 | partial | `move-existing` vs `insert-copy` IM:318; IMT:172 | Moves and inserts missing (RM:12 empty) |
| YM-QA-5 | missing | `hasOwnLike` is parsed RP:327 | No Like button exists |
| YM-QA-6 | missing | | No Music buttons |
| YM-QA-7 | missing | | Row buttons, 120 ms leave, layout join |
| YM-QA-8 | missing | | Card overlay buttons |
| YM-QA-9 | missing | | Header buttons |
| YM-QA-10 | missing | | Queue item buttons |
| YM-QA-11 | missing | | Button order |
| YM-QA-12 | missing | | Tooltips and accessible names |
| YM-QA-13 | missing | | Tab order |
| YM-QA-14 | partial | Event stop pattern exists for toasts TDT:77 | No Music controls to isolate |
| YM-QA-15 | partial | Identity signature and stale-target IM:209-260; IMT:194,209 | Controls and per-item state missing |
| YM-TGT-1 | unwired | `parseMusicPlayback` RP:201 (GWT:190); ads `tools/fixtures/music-ad-transport/` | No Music page bundle |
| YM-TGT-2 | unwired | Pointer or focus, last moved IM + `src/site/core/pointer.ts`; IMT:135 | No Music page bundle |
| YM-TGT-3 | unwired | Non-item counts as nothing IM:121; IMT:84,102 | Unwired |
| YM-TGT-4 | partial | Look-alike check IM:112; signal IM:330 | Toast copy "Couldn't tell which item…" missing |
| YM-TGT-5 | unwired | Messages IM:162-182; IMT:47,62 | Strings hard-coded, not in MSG (ARC-MOD-35); toast path unwired |
| YM-TGT-6 | partial | `nothing-playing`, `ad-playing` IM:348; fullscreen IM:240; IMT:150,165 | "Nothing is playing" / "An ad is playing" copy missing |
| YM-TGT-7 | partial | Playing song gets `insert-copy` IM:348; IMT:172 | Insert job missing |
| YM-Q-1 | missing | `queueInsert: []` RM:12 | Music insert route (ARC-ACC-24) |
| YM-Q-2 | missing | RM:12 | End-of-queue insert |
| YM-Q-3 | missing | | Block insert |
| YM-Q-4 | missing | | |
| YM-Q-5 | missing | | |
| YM-Q-6 | missing | | Empty-queue start; `Playing “…”` copy |
| YM-Q-7 | missing | | |
| YM-Q-8 | missing | | Growth confirmation |
| YM-Q-9 | missing | | Responsive-radio flag |
| YM-Q-10 | missing | | Quiet insert |
| YM-Q-11 | partial | Key repeat and per-shortcut pending ignored SKT:82,241 | Per-tab queue lane and busy button missing |
| YM-Q-12 | missing | | Insert Undo |
| YM-Q-13 | missing | Cast read exists GWT:209 | Nothing gates inserts |
| YM-Q-14 | partial | Queue-change event stream GWT:278 | Backoff re-read schedule missing |
| YM-MOVE-1 | partial | Move target classified IM:318 | `queueMove: []` RM:13 |
| YM-MOVE-2 | missing | | Pre-fire check |
| YM-MOVE-3 | missing | | Post-fire confirm |
| YM-MOVE-4 | missing | `no-effect` counting exists MT:46 | Move and its failure copy |
| YM-MOVE-5 | missing | | Already-there hints |
| YM-MOVE-6 | missing | | Move toasts and Undo |
| YM-MOVE-7 | unwired | Hint IM:165; IMT:62 | Toast path unwired; string not in MSG |
| YM-MOVE-8 | missing | | |
| YM-MOVE-9 | missing | | Server-copy request |
| YM-RM-1 | missing | `queueRemove: []` RM:12 | Remove route |
| YM-RM-2 | partial | Offer rule IM:163 | Remove and casting gate |
| YM-RM-3 | missing | | Remove toast and Undo (re-insert, move) |
| YM-RM-4 | missing | | |
| YM-RM-5 | unwired | `no-queue-target` IM:334; IMT:289 | Toast path unwired |
| YM-SAVE-1 | missing | | Split button on Music |
| YM-SAVE-2 | partial | Choose for missing target AFT:122; title `picker_quickMusicTitle` PT:75 | Single "Save to playlist…" button |
| YM-SAVE-3 | partial | Pick saves then stores PKT:279; `feedback_music_manual_untitled_first_pick` MSG | In-page Music picker popover missing |
| YM-SAVE-4 | unwired | Save mode never repins; pins only PK:218 (PKT:257) | Picker unwired |
| YM-SAVE-5 | unwired | Signed-in, target, membership, add AFT:113,122,178; explicit ignores filters AFT:168 | AddFlow unwired |
| YM-SAVE-6 | unwired | AFT:178,244; `…already_in` MSG | Unwired |
| YM-SAVE-7 | unwired | AFT:200 | Unwired; the PROVISIONAL rule is held (ticket 25) |
| YM-SAVE-8 | partial | Missing mark and copy AFT:327; `…failed_missing_one` MSG | Settings *Missing* mark and violet badge missing |
| YM-SAVE-9 | partial | `…failed_full_one` MSG | Settings *Full* mark and badge missing |
| YM-SAVE-10 | unwired | Music save/unsave Undo AFT:250; exact entry AFT:398 | Unwired |
| YM-SAVE-11 | unwired | Tuple coalescing AFT:271; recent adds AFT:297; key pending SKT:82 | Button side missing |
| YM-SAVE-12 | unwired | `keyWithoutButton` pending TM:182-189 (TMT:161,177); `…untitled_pending` MSG | Unwired |
| YM-SAVE-13 | partial | `CREATED_MS` AF:150; AFT:372 | Busy button missing |
| YM-SAVE-14 | unwired | AF:396; AFT:346 | Unwired |
| YM-SAVE-15 | missing | | Save button states |
| YM-SAVE-16 | missing | | Hover preload |
| YM-SAVE-17 | unwired | Ordered tuples AFT:271,308 | Unwired |
| YM-PICK-1 | partial | Panel and model exist (`src/ui/picker/PickerPanel.svelte`, PK) | Every Music opener missing; README: "site popovers remain separate" |
| YM-PICK-2 | missing | | In-page anchoring |
| YM-PICK-3 | partial | Refresh, Sort, close, search PT:8; Music order PKT:144; choose title PT:75 | In-page variant and song header on Music |
| YM-PICK-4 | partial | Music privacy and song count PT:53-58; live keys and pins PKT:257 | In-page variant |
| YM-PICK-5 | partial | PKT:71,482,503; 5 min PL README | In-page variant |
| YM-PICK-6 | partial | Unreadable copy `picker_unreadableSong` PT:88; PKT:129 | www-tab membership fallback not found; M2 held |
| YM-PICK-7 | partial | Row busy then checked PKT:198; no toast AFT:260 | In-page variant |
| YM-PICK-8 | partial | PKT:209,232; AFT:451,559-602 | In-page untick toast; popup sheet inline Undo |
| YM-PICK-9 | partial | PK:218; private refusal PK:221 | In-page variant |
| YM-PICK-10 | partial | PKT:559,583,602,622,658 | Failure copy variants and channel link not checked; 150 chars held |
| YM-PICK-11 | partial | Panel contains Escape (picker README) | In-page variant on Music |
| YM-PICK-12 | partial | Row navigation (picker README; `tools/fixtures/picker-ui/`) | In-page variant |
| YM-PICK-13 | unwired | `extensionPopoverOpen` blocker SK:13-16; SKT:228 | Unwired |
| YM-PICK-14 | partial | Copy exists in MSG | 5 s load deadline missing |
| YM-PICK-15 | missing | | No opener to guard |
| YM-LIKE-1 | missing | `like: []` RM:13; like state parsed RP:323 | Like route |
| YM-LIKE-2 | missing | | Icon sync |
| YM-LIKE-3 | missing | | |
| YM-LIKE-4 | missing | | Like toasts |
| YM-LIKE-5 | missing | | |
| YM-LIKE-6 | partial | "Like isn't available for albums." IM:180 | Sign-in Like copy missing |
| YM-LIKE-7 | held | | Ticket 25 M3 |
| YM-KEY-1 | unwired | Presets KB:82-86; KE:277 | Unwired |
| YM-KEY-2 | partial | Blocked presets returned KE:284 | "No key: … is used by {Other}" row missing |
| YM-KEY-3 | partial | In-page capture listener SK:69 | Settings line "Shortcuts work while…" missing |
| YM-KEY-4 | unwired | Undo liveness KB:37; `registerCoreUndo` SK:188 (SKT:335); section gate KE:175 | Unwired |
| YM-KEY-5 | unwired | SKT:99,151-206,241 | Unwired |
| YM-KEY-6 | unwired | `src/shared/keys/match.ts`; AltGr and Ctrl+Alt KE:361 | Unwired |
| YM-KEY-7 | unwired | SKT:36 | Unwired |
| YM-KEY-8 | partial | Music key table KP:60-65; KE:482 | Recorder clash copy "YouTube Music uses Q…" missing |
| YM-KEY-9 | unwired | Conflicts and Use it here (shared keys README; KR) | KR has no runtime render test (status.md) |
| YM-KEY-10 | partial | Target resolution IM:323-349 | Insert, move, like, remove jobs; in-page picker |
| YM-KEY-11 | missing | | No buttons |
| YM-KEY-12 | partial | Bindings ignore health (shared keys README); unavailable actions named MT:127; `notice_music_one` MSG | Per-press answer "{Action} isn't working right now…" missing |
| YM-KEY-13 | missing | | Nothing acts yet; recheck once keys run |
| YM-FB-1 | unwired | One toast, Music surfaces TDT:105 | Unwired; look is held |
| YM-FB-2 | partial | | Quiet queue and like routes missing; live check held |
| YM-FB-3 | unwired | 6 s TM:103; TMT:10,27,40 | Unwired |
| YM-FB-4 | unwired | TMT:52,150; TDT:93 | Unwired |
| YM-FB-5 | unwired | Toaster is page-scoped, not navigation-scoped | No navigation test |
| YM-FB-6 | unwired | TMT:177; per-opener feedback (add-flow README) | Unwired |
| YM-FB-7 | missing | | Button states, 10 s failed |
| YM-FB-8 | partial | Save Undo AFT:250; untick Undo PKT:209 | Queue, like and library Undo |
| YM-FB-9 | partial | Undo-failed plan FB:38 | Casting answer |
| YM-FB-10 | partial | Music song wording `src/shared/copy/toast.bun-test.ts:83` | Queue and like copy missing |
| YM-FB-11 | unwired | Failure tone in toaster | Rendering held |
| YM-FB-12 | missing | No `console.` in AF, `src/site` or copy | Console log per save |
| YM-FAIL-1 | partial | No resend AFT:235; ⋮ copy `…failed_unrecognised_one` MSG | Button failed state; queue failure copy |
| YM-FAIL-2 | unwired | `detail-failed` IMT:258 | Unwired |
| YM-FAIL-3 | partial | Stale checks before acting IM:241-260 | No action finishes yet |
| YM-FAIL-4 | partial | Action job table REG:30-40; MT:127 | Page-load internals probe for actions |
| YM-FAIL-5 | unwired | Notices MT:333,386; `notice_music_one` MSG; site notice `src/site/core/notice/` | Unwired |
| YM-FAIL-6 | partial | Statuses MD:95 | Popup strip, Settings line, amber badge |
| YM-FAIL-7 | partial | Two in a row MTH:2; MT:46 | Nothing raises it on Music |
| YM-FAIL-8 | partial | Thresholds MTH:4-6; MT:78; player-bar exception MD:11 | Page-side anchor measurement |
| YM-FAIL-9 | partial | Transport needs `ytmusic-app` (`src/page/adapters/live-music.ts:7`) | Whole-site status wiring |
| YM-FAIL-10 | partial | MT:105,127 | Picker-mark and account-key inputs |
| YM-FAIL-11 | unwired | Success clears MT:46 | Unwired |
| YM-FAIL-12 | partial | MT:170 | Music detection (no queue edits) |
| YM-CAST-1 | partial | Cast read GW:307; GWT:209 | Nothing applies it |
| YM-CAST-2 | missing | | Gate, dimmed buttons, copy; M5 held |
| YM-CAST-3 | missing | | Follows CAST-2 |
| YM-CAST-4 | missing | | Follows CAST-2 |
| YM-CAST-5 | unwired | Save, like, library jobs need no cast REG:33-37 | Unwired |
| YM-BAR-1 | partial | Keys act without the bar IMT:150; GWT:190 | Queue-item and bar placements |
| YM-BAR-2 | partial | `buttons.bar` TY:60 | Bar Save button |
| YM-BAR-3 | partial | Exception MD:11 | Drawing |
| YM-BAR-4 | missing | | |
| YM-BAR-5 | unwired | Separate switches TY:60 | No Settings UI |
| YM-BAR-6 | missing | | |
| YM-BAR-7 | partial | `nowPlaying` stream GWT:278 | Bar Save |
| YM-BAR-8 | held | | Ticket 25 |
| YM-BAR-9 | partial | Push only on owned events GWT:278 | Bar Save |
| YM-POP-1 | missing | | No 2.0 popup |
| YM-POP-2 | partial | `runIn` never switches tab (tabs README) | Popup |
| YM-POP-3 | missing | | |
| YM-POP-4 | missing | | Popup picker sheet |
| YM-POP-5 | partial | TABS `runIn` | Popup route |
| YM-POP-6 | missing | | |
| YM-POP-7 | missing | | |
| YM-POP-8 | missing | | |
| YM-POP-9 | missing | | Also M4 held |
| YM-POP-10 | missing | | Probe |
| YM-POP-11 | partial | Active then `lastAccessed` TABS:287 | No audible rank |
| YM-POP-12 | missing | | |
| YM-POP-13 | missing | | |
| YM-POP-14 | missing | | |
| YM-PS-1 | partial | `shortcuts.music` DEF:8, set on enable FS:59; page predicate REG:55 (RGT:53) | `feature-shortcuts-music` bundle |
| YM-PS-2 | partial | FS:28,66-67; FST:51,66 | Denial copy and badge |
| YM-PS-3 | unwired | `playlist-shortcut` rule IM:168-172 | Feature missing |
| YM-PS-4 | partial | No-playlist hint AFT:122; copy in MSG | Choose for a shortcut in page |
| YM-PS-5 | partial | Music shortcut add `add-flow.type-test.ts:19` | Feature; Settings deep link |
| YM-PS-6 | unwired | Per-feature feedback in AF | Unwired |
| YM-PS-7 | unwired | YouTube picker reserves only YouTube KE:130 | Unwired |
| YM-PS-8 | partial | PKT:257 | In-page picker |
| YM-PS-9 | unwired | www-only pages REG:44-100; RGNT:56 | Registrar unwired |
| YM-APP-1 | held | | Native app window (ticket 25 M4) |
| YM-APP-2 | held | | M4 |
| YM-APP-3 | missing | | No 2.0 popup; M4 |
| YM-APP-4 | held | | M4 |
| YM-APP-5 | missing | | Follows CAST-2 |
| YM-NARROW-1 | missing | | |
| YM-NARROW-2 | missing | | |
| YM-NARROW-3 | missing | | |
| YM-NARROW-4 | missing | | Settings warning |
| YM-MORE-1 | partial | Off, no key, never preset DEF:17-23; KE:277 | Actions |
| YM-MORE-2 | partial | Library, mix, album, artist endpoints RP:305-319 | Buttons |
| YM-MORE-3 | missing | `library: []` RM:13 | |
| YM-MORE-4 | missing | `navigate: []` RM:13 | |
| YM-MORE-5 | missing | RM:13 | |
| YM-MORE-6 | missing | | |
| YM-MORE-7 | partial | IM:162-182 | Actions |
| YM-MORE-8 | partial | Action jobs REG:36-39 | Failure copy missing |
| YM-MORE-9 | held | | Ticket 25 M3 |
| YM-ANY-1 | partial | TABS:287 | Audible rank; command handler |
| YM-ANY-2 | missing | No `onCommand` in `src` | Commands, copy |
| YM-ANY-3 | missing | | |
| YM-ANY-4 | missing | | Toolbar ✓/✕ |
| YM-ANY-5 | missing | | |

## Chapter 09: Parity

PAR-NEW-34 is DECLINED (R87). It's out of scope and stays out of the counts.

| ID | Status | Evidence | Gap |
|---|---|---|---|
| PAR-CAP-01 | partial | Tracker TR (TRT); add flow AF | Page feed, `feature-auto-add` bundle; interim keeps 1.x (`youtube.content.tsx:90-108`) |
| PAR-CAP-02 | partial | Played seconds TRT:37-124; goal TRT:138 | Player feed |
| PAR-CAP-03 | partial | Overrides TRT:203 | Settings UI |
| PAR-CAP-04 | partial | Once per playback TRT:408; remembered TRT:279 | Storage of progress (DATA-24) and feed |
| PAR-CAP-05 | partial | Pauses interrupt TRT:92 | Feed ("Continue watching?") |
| PAR-CAP-06 | partial | Live excluded TRT:224-239 | Feed |
| PAR-CAP-07 | partial | Takes Videos/Shorts/Both TRT:247 | Shorts feed, UI |
| PAR-CAP-08 | partial | Other video rejected TRT:109 | Player ID read feed |
| PAR-CAP-09 | missing | | Miniplayer feed |
| PAR-CAP-10 | partial | Hidden-tab hold TMT:40 | Feed |
| PAR-CAP-11 | partial | Made-for-kids facts in tracker (README) | Player recognition; made-for-kids held |
| PAR-CAP-12 | partial | Goal rule TRT:138 | Feed |
| PAR-CAP-13 | unwired | Membership before add AFT:178 | Unwired; interim already deletes the IndexedDB (`src/lib/storage.ts:219`) |
| PAR-CAP-14 | unwired | Filters before membership AFT:155 | Unwired |
| PAR-CAP-15 | unwired | Add via playlist edit RW:13; GPF | Unwired; route held (25) |
| PAR-CAP-16 | partial | Pause AF `pause`; skip AFT:415 | Switch and popup controls |
| PAR-CAP-17 | unwired | Silent signed-out auto-add AFT:113 | Popup "what's missing" |
| PAR-CAP-18 | partial | CF (+ test) | Empty-allowlist warning in editor |
| PAR-CAP-19 | unwired | `channelOf` read then plain RW:15 | Unwired |
| PAR-CAP-20 | unwired | Filtered copy `…filtered` MSG; `src/shared/copy` | Console log not found |
| PAR-CAP-21 | unwired | `src/background/store/channel-filter-edit.ts` | Unwired |
| PAR-CAP-22 | missing | | 2.0 editor UI; interim keeps 1.x |
| PAR-CAP-23 | unwired | `resolveChannel` plain RW:16 | Unwired; hop count not checked |
| PAR-CAP-24 | unwired | Filters under Setup; local-filter-writer | Unwired |
| PAR-CAP-25 | unwired | Explicit adds ignore filters AFT:168; queue ignores QB test :77 | Unwired |
| PAR-CAP-26 | partial | KB, SK | `feature-shortcuts-www`; manifest `commands` |
| PAR-CAP-27 | unwired | Watch later preset KB; migration no preset KE (legacy) | Unwired |
| PAR-CAP-28 | partial | Recorder reducer `src/shared/keys/recorder.ts`; KR | Popup and Settings host; KR untested at runtime |
| PAR-CAP-29 | unwired | match.ts; SKT:36 | Unwired |
| PAR-CAP-30 | partial | Shortcut list model TY:48-51 | Settings UI |
| PAR-CAP-31 | partial | `src/site/core/items-www.ts` (+ test) | Shortcut feature |
| PAR-CAP-32 | unwired | AFT:113,122 | Unwired |
| PAR-CAP-33 | unwired | Off by default DEF:10; QB | SiteCore services (status.md) |
| PAR-CAP-34 | unwired | Card table items-www; QB | Unwired |
| PAR-CAP-35 | unwired | QB placement and states test :52,:88,:106 | Unwired |
| PAR-CAP-36 | unwired | Resolver and quiet route GQF:38,93,164 | Unwired; held (25) |
| PAR-CAP-37 | unwired | Miniplayer fallback GQF:141 | Unwired; held (25, L8) |
| PAR-CAP-38 | unwired | CM; `openCardMenu` GQF:270 | Unwired |
| PAR-CAP-39 | unwired | CM tests :81,:90,:98 | Unwired |
| PAR-CAP-40 | unwired | Toaster TM | Unwired; interim keeps Sonner |
| PAR-CAP-41 | unwired | Feedback off keeps failures TMT:177 | Unwired |
| PAR-CAP-42 | unwired | `src/shared/copy` tests | Unwired |
| PAR-CAP-43 | partial | Clear all `src/ui/backend/clear-all.ts` (+ test) | Settings dialog |
| PAR-CAP-44 | partial | `settings.theme` DEF:5 | Settings › Appearance |
| PAR-CAP-45 | partial | Theme tokens `src/ui/lib/theme.ts` | Popup and Settings |
| PAR-CAP-46 | partial | Brand assets `src/assets/brand/` | Manifest still "YouTube Playlist Tools" (`wxt.config.ts:33`) |
| PAR-CAP-47 | unwired | `playlists` and `membership` routes RW:12; PL | Unwired; held (25) |
| PAR-CAP-48 | unwired | 5 min cache, 24 h new rows PL README; PKT:482,503 | Unwired |
| PAR-CAP-49 | unwired | WL first, Sort A–Z PKT:144,158 | Unwired |
| PAR-CAP-50 | unwired | WL identity in PL | Unwired |
| PAR-CAP-51 | unwired | No-tab read-only PKT:521 | Unwired |
| PAR-CAP-52 | built | Interim replaced OAuth with tab access (commit `54cab5b72`); check-manifests:29 | none |
| PAR-CAP-53 | built | `removeLegacyCredentials` `src/lib/storage.ts:190` | none |
| PAR-CAP-54 | built | Same; tokens never stored by interim | Upgrade note link is 08's |
| PAR-CAP-55 | partial | Accounts `src/background/accounts/accounts.ts` | Header UI |
| PAR-CAP-56 | built | No `server/` directory | `archive/token-broker` tag absent locally |
| PAR-CAP-57 | unwired | 429 pause AFT:346 | Unwired |
| PAR-CAP-58 | unwired | Guard GW:191; AFT:185 | Unwired |
| PAR-CAP-59 | held | Signed requests GPF signer test | Cookie route decision (25, R48) |
| PAR-CAP-60 | missing | | 2.0 popup; interim keeps 1.x popup |
| PAR-CAP-61 | missing | | This video card |
| PAR-CAP-62 | missing | | Settings page |
| PAR-CAP-63 | partial | First-run page ONB | Watch-page button, badge, browser menu |
| PAR-CAP-64 | partial | Gecko ID `wxt.config.ts:42`; CWS job `release.yml:275` | Store listing is external |
| PAR-CAP-65 | built | `wxt.config.ts:36,44` | Not asserted by check-manifests |
| PAR-CAP-66 | partial | storage, scripting; runtime registration | Firefox `*://*.youtube.com/*`; two registrations per site; optional `contextMenus`; check-manifests:31 forbids the Firefox host |
| PAR-CAP-67 | built | `wxt.config.ts:46` | Not asserted by check-manifests |
| PAR-CAP-68 | unwired | `src/shared/rpc/` (+ tests) | Interim sends untyped `{action}` messages |
| PAR-CAP-69 | partial | CI compile, tests, builds, manifest check `ci.yml:34-57`; coverage guard `tests/guards` | `check:budget`, real-browser layer, daily watches |
| PAR-CAP-70 | partial | Per-store jobs with environments `release.yml:165,275`; sources rebuild `:87` | ARM64 rebuild, 1.99 beta order, soak, browser-watch and live-check gates |
| PAR-CAP-71 | unwired | LG cleanup test :207 | Unwired |
| PAR-CAP-72 | unwired | LG key conversion test :180 | Unwired |
| PAR-CAP-73 | unwired | LG test :146,:180 | Unwired |
| PAR-CAP-74 | unwired | LG test :180 | Unwired |
| PAR-CAP-75 | partial | LG produces note state | Upgrade note page |
| PAR-CAP-76 | partial | Credentials deleted `src/lib/storage.ts:190` | Note copy and link |
| PAR-CAP-77 | partial | LG crash-boundary tests :467 | Start-time migration unwired; Firefox host for silent update missing |
| PAR-CAP-78 | unwired | No-rewatch duplicate AFT:178; status read GPF | Unwired; L6 held |
| PAR-CAP-79 | unwired | Session requests RW; `openCardMenu` only UI driver | Unwired |
| PAR-DEF-01 | partial | AFT:113 | Popup message; interim keeps 1.x |
| PAR-DEF-02 | unwired | Copy module tests | Unwired |
| PAR-DEF-03 | unwired | Failure tone, roles TDT:37 | Unwired |
| PAR-DEF-04 | unwired | QB glyphs `glyphs.ts` | Unwired |
| PAR-DEF-05 | unwired | Site skins `src/site/kit/overlay/skin.ts` | Unwired; rendering held |
| PAR-DEF-06 | unwired | Watch later preset KB | Unwired |
| PAR-DEF-07 | unwired | SKT:151-206,241 | Unwired |
| PAR-DEF-08 | partial | Recorder reducer | Host UI |
| PAR-DEF-09 | missing | | Percentage field UI |
| PAR-DEF-10 | partial | Marks in AF (AFT:327) | Settings list, banner, badge, deep link |
| PAR-DEF-11 | partial | No free-text IDs in model; LG cleanup | UI |
| PAR-DEF-12 | partial | Background owner and tab-view publication | UI `Backend.watch` consumers |
| PAR-DEF-13 | missing | | Settings page |
| PAR-DEF-14 | partial | Picker search and sort PKT:158 | Auto-add list search |
| PAR-DEF-15 | missing | | This video card |
| PAR-DEF-16 | missing | | Pills |
| PAR-DEF-17 | partial | Toast actions in copy | Banners |
| PAR-DEF-18 | partial | Clear all backend | Settings dialog |
| PAR-DEF-19 | partial | 2.0 clear-all keeps sync unless ticked (`src/ui/backend/clear-all.ts`) | Unwired; interim still clears sync (`src/lib/storage.ts:210`) |
| PAR-DEF-20 | partial | Accounts module | Header |
| PAR-DEF-21 | missing | | Placeholder |
| PAR-DEF-22 | unwired | AFT:178 | Unwired |
| PAR-DEF-23 | unwired | CM test :81 | Unwired |
| PAR-DEF-24 | unwired | QB test :106; GQF:72 | Unwired; held (25) |
| PAR-DEF-25 | partial | Ad interruption TRT:102,186 | Feed; stitched ads held |
| PAR-DEF-26 | partial | Wrong video rejected TRT:109 | Feed |
| PAR-DEF-27 | partial | TRT:147 | Feed |
| PAR-DEF-28 | partial | `permissions.request` in `src/ui/backend/browser.ts` | UI wiring |
| PAR-DEF-29 | built | IndexedDB deleted `src/lib/storage.ts:219` | none |
| PAR-DEF-30 | unwired | Registrar RR | Interim uses scripting for its single script |
| PAR-DEF-31 | missing | README still 1.5.0 | Rewrite (release) |
| PAR-DEF-32 | partial | Gateway, core and kit tests exist | Real-browser layer, CI watches |
| PAR-DEF-33 | unwired | Independent targets AFT:218 | Unwired |
| PAR-DEF-34 | unwired | AFT:271 | Unwired |
| PAR-DEF-35 | unwired | AFT:200 | Unwired; held (25) |
| PAR-DEF-36 | unwired | Status read GPF | Unwired |
| PAR-DEF-37 | unwired | No channel cache in 2.0; LG | Interim cleanup not checked |
| PAR-DEF-38 | unwired | Schema marker LG test :45 | Unwired |
| PAR-DEF-39 | built | `src/lib/storage.ts:190` | Note link |
| PAR-DEF-40 | built | No `server/` | none |
| PAR-DEF-41 | unwired | GQF:164 | Unwired; held (25) |
| PAR-DEF-42 | partial | Monitor MD | Popup, Settings, badge, page presenter |
| PAR-DEF-43 | unwired | LG test :146 | Note page |
| PAR-NEW-01 | unwired | WL in PL and KB | Unwired |
| PAR-NEW-02 | missing | No `feature-quick-save` file | Quick-save feature |
| PAR-NEW-03 | partial | Picker panel and model | In-page popover |
| PAR-NEW-04 | partial | Accounts and store | Header, Show the setup for |
| PAR-NEW-05 | partial | Shortcut list model KB | Feature, Settings |
| PAR-NEW-06 | partial | Sync store modules | UI; status.md lists SYNC-11 tie-break gap |
| PAR-NEW-07 | partial | TRT:247 | Feed, UI |
| PAR-NEW-08 | partial | PKT:602,636 | UI hosts |
| PAR-NEW-09 | partial | `musicSection` gate RGN:83 | Popup tab, Settings section |
| PAR-NEW-10 | partial | IM, RP | Music actions feature; queue routes |
| PAR-NEW-11 | partial | KB:82-86 | Music keys feature |
| PAR-NEW-12 | partial | FS:59,66 | `feature-shortcuts-music` |
| PAR-NEW-13 | held | | M4 |
| PAR-NEW-14 | external | CWS job `release.yml:275` | Listing itself unverified |
| PAR-NEW-15 | unwired | Core Undo SKT:335 | Unwired |
| PAR-NEW-16 | unwired | GQF:187-228 | Unwired; held (25) |
| PAR-NEW-17 | missing | | Music queue jobs |
| PAR-NEW-18 | partial | Pause, skip in AF; tracker skip TRT:308 | Popup controls |
| PAR-NEW-19 | partial | TRT:203 | UI |
| PAR-NEW-20 | partial | Remembered snapshot TR | DATA-24 storage |
| PAR-NEW-21 | missing | No `feature-watch-button` | Watch-page button |
| PAR-NEW-22 | partial | Monitor | Diagnostics page, badge |
| PAR-NEW-23 | missing | No badge API use | Badge |
| PAR-NEW-24 | unwired | First-run page ONB (`first-run.bun-test.ts`) | No entrypoint mounts it |
| PAR-NEW-25 | partial | Registrar plan | Footprint tags in Settings (`FootprintTag.svelte` exists) |
| PAR-NEW-26 | missing | No `commands` in manifest | `_execute_action` |
| PAR-NEW-27 | unwired | Private paths in AF, PK | Unwired |
| PAR-NEW-28 | partial | FS, `addHostAccessRequest` | Manifest optional Music host |
| PAR-NEW-29 | missing | | Budgets never measured (status.md) |
| PAR-NEW-30 | partial | items-www | Shortcut feature |
| PAR-NEW-31 | partial | PKT:209 | In-page and popup hosts |
| PAR-NEW-32 | partial | Endpoints parsed RP:305-319 | Actions |
| PAR-NEW-33 | partial | `recentAdds` device flag TY:137 | Popup list |
| PAR-NEW-35 | missing | | Commands and handler |
| PAR-NEW-36 | partial | `src/shared/settings-file`; import plan | Settings UI |
| PAR-NEW-37 | missing | No `contextMenus.create` | Browser menu |
| PAR-NEW-38 | missing | `toolbarTick` setting only DEF:7 | Icon tick |
| PAR-NEW-39 | partial | MSG, `src/shared/i18n` | Manifest `default_locale`; interim strings |
| PAR-NEW-40 | unwired | PKT:172 | Unwired |
| PAR-NEW-41 | missing | No `issues/new` | Report a problem |
| PAR-NEW-42 | partial | GA, GAF | Execution adapter, popup row, UI (status.md) |
| PAR-NEW-43 | unwired | GAF gather.bun-test.ts:78,101 | Unwired; held (25) |
| PAR-NEW-44 | partial | Trigger rules GR (tests :257-295) | Triggers not started (status.md) |
| PAR-NEW-45 | unwired | Shuffle GR test :223 | Unwired |
| PAR-GT-01 | missing | | Popup row, Enter rule |
| PAR-GT-02 | unwired | Window passed explicitly GAF manual-completion :255 | Unwired |
| PAR-GT-03 | unwired | `videoOf` GR test :141,:149 | Unwired |
| PAR-GT-04 | unwired | Address only GR test :138 | Unwired |
| PAR-GT-05 | unwired | Dedup GR test :201 | Unwired |
| PAR-GT-06 | unwired | Orders GR test :175; detector GAF :206 | Unwired |
| PAR-GT-07 | unwired | Three destinations in GA | UI |
| PAR-GT-08 | unwired | GAF :9 | Unwired; held (25 G4) |
| PAR-GT-09 | unwired | GAF :35,:49 | Unwired; held (25 G3) |
| PAR-GT-10 | unwired | Close after confirm GAF :9,:78 | Unwired |
| PAR-GT-11 | missing | | Result copy and popup behaviour |
| PAR-GT-12 | unwired | Gather settings TY | UI |
| PAR-GT-13 | unwired | Queue tab GAF :49 | Unwired; held (25 G3) |
| PAR-GT-14 | unwired | No embed in GA | Unwired |
| PAR-GT-15 | unwired | No poller in GA | Unwired |
| PAR-GT-16 | unwired | Nothing needed beyond GA | Unwired |
| PAR-GT-17 | unwired | Same | Unwired |
| PAR-GT-18 | unwired | Same | Unwired |
| PAR-GT-19 | unwired | Same | Unwired |
| PAR-GT-20 | unwired | Same | Unwired |
| PAR-GT-21 | unwired | GR test :223 | Unwired |
| PAR-GT-22 | unwired | Same as GT-16 | Unwired |
| PAR-GT-23 | unwired | Failure closes nothing GAF :25 | Copy missing |
| PAR-GT-24 | unwired | Nothing stored per window | Unwired |
| PAR-GT-25 | missing | | Popup Enter |
| PAR-GT-26 | unwired | No page keys in gather | Unwired |
| PAR-GT-27 | unwired | Same | Unwired |
| PAR-GT-28 | unwired | Same | Unwired |
| PAR-GT-29 | unwired | Same | Unwired |
| PAR-GT-30 | unwired | Same | Unwired |
| PAR-GT-31 | missing | | Settings card |
| PAR-GT-32 | missing | | Card line |
| PAR-GT-33 | partial | Last result kept GAF manual-completion :17 | "Last gather" UI |
| PAR-GT-34 | partial | Clear all backend | Settings |
| PAR-GT-35 | missing | | Report a problem, credit line |
| PAR-GT-36 | built | Nothing ported | none |
| PAR-GT-37 | missing | | Settings page |
| PAR-GT-38 | missing | | Gather copy (YT-GT-31 to 35 not started) |
| PAR-GT-39 | unwired | GR tests :112-155 | Unwired |
| PAR-GT-40 | partial | Behaviour in GA | Listing text external; budget unmeasured |
| PAR-GT-41 | unwired | No embed | Unwired |
| PAR-GT-42 | unwired | GAF :35,:78 | Unwired |
| PAR-GT-43 | unwired | GR test :138 | Unwired |
| PAR-GT-44 | unwired | GAF :206 | Unwired |
| PAR-GT-45 | unwired | Native queue panel | Unwired |
| PAR-GT-46 | missing | | Settings page |

## Work to do

The units are ordered by dependency. Sizes are guesses.

**U0. Ship the 2.0 shell.** Replace the interim entrypoints with 2.0 ones. The background composes the store, AddFlow, Tabs, Registrar, Monitor, Playlists, Gather and the RPC router. The page bundles are `page-www`, `core-www`, `kit-www`, `page-music`, `core-music`, `kit-music` and `popovers`. The manifest gets the 2.0 name, hosts (Firefox `*://*.youtube.com/*`, Chrome optional Music), `commands` (`_execute_action` and three any-tab commands), optional `contextMenus` and `default_locale`. `scripts/check-manifests.sh` must change with it. IDs: PAR-CAP-26, 46, 66, 68, PAR-DEF-30, PAR-NEW-26, 39, YM-FEAT-6, 10 (manifest part), YM-FEAT-11, YM-ACC-1. Files: `wxt.config.ts`, `src/entrypoints/*`, `scripts/check-manifests.sh`, new bundle entries under `src/entrypoints/`. Depends on nothing. Size L.

**U1. SiteCore assembly for Music.** Build the core's services (`run`, `can`, `items`, `keys`, `report`, `popovers`, `kit`) and the page bridge. This connects `createLiveGateway` (`src/page/adapters/live-gateway.ts`), PageLink, ExtLink, the feature host, `MusicItems`, `Keys`, the toaster and feedback kit. IDs (unwired today): YM-TGT-1 to 3, 5, YM-KEY-4 to 7, YM-FB-1, 3 to 6, 11, YM-FAIL-2, 5, 11, YM-PICK-13, YM-PS-6, 7, YM-RM-5, YM-MOVE-7. Files: new `src/site/core/` assembly, `src/page/` entry. Depends on U0. Size L. The same assembly for www is the other auditors' unit and should be shared.

**U2. Music queue jobs.** Add the `queueInsert`, `queueMove`, `queueRemove`, `queueRemoveIds` and `queueReinsert` routes for Music. Add the growth and position confirmation with the R114 backoff, the responsive-radio flag, quiet inserts with `quiet-route-noisy` detection, server-copy moves and cast gating. IDs: YM-Q-1 to 14, YM-MOVE-1 to 9, YM-RM-1 to 4, YM-CAST-1 to 4, YM-APP-5, YM-FAIL-7, 12, YM-TGT-7, YM-QA-4, PAR-NEW-17. Files: `src/page/routes/music.ts`, new `src/page/gateway/music-queue.ts`, `src/page/read-parsers.ts`. Depends on U1 for wiring, not for authoring. Size L. Live checks M1 and M5 are held.

**U3. Music like, library and navigate jobs.** IDs: YM-LIKE-1 to 6, YM-MORE-3 to 5, YM-ACC-6 (like part). Files: `src/page/routes/music.ts`, gateway. Depends on U1. Size M. M3 is held.

**U4. The `music-actions` page feature.** Buttons on rows, cards, headers and queue items, plus the player-bar Save. It covers placement, order, tooltips, isolation, state keyed by item and button states. IDs: YM-QA-1 to 3, 5 to 15, YM-SAVE-1, 2, 13, 15, 16, YM-KEY-11, YM-FB-7, YM-BAR-1 to 7, 9, YM-NARROW-1 to 3, YM-MORE-1, 2, 6, YM-ACC-5, 7, YM-FEAT-7, 8, YM-FAIL-1, 3, 4, 8, 9, 10, YM-CAST-2 (buttons), PAR-NEW-10, 32. Files: new `src/site/features/music-actions/`. Depends on U1 to U3 and U6. Size L.

**U5. The `music-keys` and `shortcuts-music` page features.** They connect Keys, `MusicItems.resolve` and the jobs, the per-press answers for unavailable or not-working actions, and playlist shortcuts on Music. IDs: YM-KEY-1, 2, 3, 10, 12, 13, YM-PS-1 to 5, 8, YM-TGT-4, 6, YM-SAVE-11, 12, YM-MORE-7, PAR-NEW-11, 12. Files: new `src/site/features/music-keys/`, `src/site/features/shortcuts/`. Depends on U1, U2, U3 and U6. Size M.

**U6. In-page picker popover.** The site variant of `PickerPanel` for both sites. It covers anchoring, the 5 s load deadline, Esc containment, the choose mode for a shortcut, and the untick toast. IDs: YM-PICK-1 to 12, 14, 15, YM-SAVE-3, YM-PS-8, PAR-NEW-03, 31. Files: `src/ui/picker/`, new `src/site/popovers/`. Depends on U1. Size M.

**U7. Music copy.** Move the Music strings into `messages.json` (IM:162-182 and IM:334 are hard-coded). Add every §13 row that has no key: queue confirmations and failures, moves, Nothing is playing, An ad is playing, Couldn't tell which item, the like and library sign-in and failure rows, Not available while casting, the any-tab hint, the whole-site and account-keys notices, R71's access denial, the recorder's clash line, the Settings lines. Add the per-save console log (YM-FB-12). IDs: YM-FB-2, 8, 9, 10, 12, YM-KEY-8, YM-PICK-10 (copy check), YM-MORE-8, YM-SAVE-8, 9 (copy present). Files: `src/public/_locales/en/messages.json`, `src/shared/copy/`, `src/shared/i18n/parameters.ts`, `src/site/core/items-music.ts`. Depends on nothing. Size M.

**U8. 2.0 popup, including the YouTube Music tab.** The account header, breakage strip, banners, This video, Playing now with its split Save, picker sheet, read-only keys and Change keys, the section switch, and Gather's row. IDs: YM-POP-1 to 14, YM-FEAT-1, 5, YM-APP-3, YM-FAIL-6 (popup part), PAR-CAP-60, 61, 55, PAR-DEF-01, 15, 16, 20, 21, PAR-NEW-33, PAR-GT-01, 11, 25. Files: `src/ui/popup/` (new), popup entrypoint. Depends on U0 and U9 (probe). Size L.

**U9. On-demand probe and Playing now tab choice.** Inject the core into one Music tab for `nowPlaying` with no feature on. Add audible ranking to Tabs. IDs: YM-POP-10, 11, YM-ANY-1, YM-FEAT-6. Files: `src/background/tabs/tabs.ts`, `src/background/registrar/`. Depends on U0 and U1. Size S.

**U10. 2.0 Settings page.** It needs the YouTube Music section (switches, button list with the narrow-row warning, keys, quick-save row with marks) and Everywhere's undo key. The rest of Settings belongs to 05's auditor. IDs: YM-FEAT-2 to 5, YM-KEY-2, 3, YM-BAR-5, YM-NARROW-4, YM-SAVE-8, 9 (marks), PAR-CAP-03, 22, 30, 43, 44, 45, 62, PAR-DEF-08 to 14, 18, PAR-GT-31, 32, 34, 37, 46. Files: `src/ui/settings/` (new), options entrypoint. Depends on U0. Size L.

**U11. Toolbar badge and icon.** The violet and amber "!", the toolbar tick and paused mark, and the any-tab ✓/✕. IDs: YM-FEAT-10 (badge), YM-FAIL-6 (badge), YM-PS-2, YM-ANY-4, PAR-NEW-23, 38. Files: new background adapter. Depends on U0 and Monitor wiring. Size S.

**U12. Keys from any tab.** The command handler, the Music tab choice and the hints. IDs: YM-ANY-2 to 5, PAR-NEW-35. Files: background, manifest. Depends on U0, U1, U3 and U9. Size M.

**U13. YouTube-side features 2.0 still lacks** (shared with 02's auditor): the auto-add page feed and `feature-auto-add`, `feature-shortcuts-www`, `feature-quick-save`, `feature-watch-button`, browser-menu Save, and Report a problem. IDs: PAR-CAP-01 to 12, 16, 31, PAR-DEF-25 to 27, PAR-NEW-02, 07, 21, 30, 37, 41. Size L, split per feature.

**U14. Gather completion** (status.md's open list): the execution adapter, the `ui.gather*` routes, automatic triggers, feedback and copy. IDs: PAR-NEW-42, 44, PAR-GT-01, 11, 25, 38. Size M.

**U15. Release and CI** (shared with 07 and 08): the budget check, the real-browser layer, daily watches, the ARM64 sources rebuild, release order and soak, the live-check gate, and the README rewrite. IDs: PAR-CAP-69, 70, PAR-DEF-31, 32, PAR-NEW-29. Size M.

## Questions

1. **What does the interim React build become?** U0 replaces `src/entrypoints/*` and `src/lib/*`. The spec doesn't say whether the interim build ships as a release before 2.0, or whether 2.0's first beta replaces it outright. That decides whether U0 deletes `src/lib/*` and the React UI in one wave or keeps them behind a flag. This is the owner's call.
2. **Choose mode's title for a playlist shortcut** (03 "Not pinned down" 1). U5 and U6 need wording for a shortcut's Choose picker on Music, and YM-PICK-3's choose-mode title fits only the quick-save playlist.
3. **Membership fallback for the Music picker.** YM-PICK-6 reads check marks from a youtube.com serving tab when YouTube Music's answer lacks membership. `PL`'s README says list reads use the www source. It doesn't say whether Music membership falls back to a www tab, and that depends on ticket 25 M2. U6 can't settle this until M2 runs.
4. **Unwired versus interim for KEPT parity rows.** This report counts interim 1.x behaviour as not delivered by 2.0. If the owner wants an interim-delivered KEPT row counted as satisfied, about 25 rows in §1.1 to §1.6 move from partial or unwired. That's a reporting choice, not a build decision.
