# Gateway read specimen provenance

Every specimen in `gateway.specimens.ts`, `live-read.specimens.ts`, the adjacent tests and `run.ts` is hand-written and synthetic.
None is a capture or a derived capture. No client version, capture date or last-confirmed date is assigned.
Historical observations in the cited tickets belong to those tickets. This authoring unit performed no live check.
Synthetic identity strings and `.invalid` artwork URLs are test data.

| Specimen family | Cited evidence | What remains unqualified |
| --- | --- | --- |
| Page account, signed-out visitor, missing and throwing config | Architecture 06 §6.2.10 and §6.2.6 | Signed-in L7, complete Music identity stability and the later response-context trip. |
| Watch and Shorts navigation, URL and player disagreement | Ticket 07 lines 94-101 and 250-264; architecture 06 §6.2.6 | Actual event envelope, reel response nesting and every-swipe delivery. |
| Counting player versus inline preview, replacement and miniplayer | Ticket 07 lines 94-101 and 250-264 | Live `yt-player-updated` and `onVideoDataChange` dispatch, player moves and replacement timing. |
| Ordinary ads, ad events and Shorts ad navigation | Ticket 07 lines 105-125 and 265-289 | Signed-in ads, stitched timelines, Shorts ad URL and classes. |
| Clip, made-for-kids, live, premiere, upcoming, post-live and replay | Ticket 07 lines 89-93, 129-147 and 271-280 | Marker specificity, live flag timing and ending-in-place transitions. |
| Invalid times, durations, rates and malformed raw objects | Shared media and stream contracts | Fault injection proves only the authored rejection behavior when a later executor runs it. |
| Music metadata and artwork | Architecture 06 §6.2.7; ticket 21 line 47 | Real metadata refresh events and variants without a player bar. |
| Selected-queue fallback and queue indices | Architecture 06 §6.2.7; ticket 10 lines 162-176 | Exact queue item title and byline envelopes and queue notification binding. |
| Targeted rows, cards and native menu endpoints | Architecture 06 §6.2.7; ticket 21 lines 42-47; ticket 27 lines 180-193 | Renderer title nesting, header count, library toggle fields and captured menu variants. |
| Automix ancestry | Ticket 27 line 183 | Live recycled-row movement. `inAutomix` is a local port observation, never a claimed raw YouTube field. |
| Boolean cast status and boolean player fallback | Ticket 25 lines 51-58; architecture 06 §6.2.7 | These boolean conditions test parser behavior only. The tickets do not specify a live enum or player method. |
| Missing and throwing hooks, stale callbacks, repeated watchers, independent gateways | Architecture 06 §6.2.9, §6.5.1 and §6.5.2 | Actual browser ownership and native delivery semantics. |

The full source paths are `.scratch/rebuild/spec/06-architecture.md` and `.scratch/rebuild/issues/07-watched.md`, `10-youtube-access.md`, `21-youtube-music-internals.md`, `25-live-checks.md`, and `27-youtube-music-controls.md`.
Their exact frozen identities accompany the handoff dependency pins.

Q-FIX-3 does not qualify these normal page reads as captured evidence or waive Q-FIX-5.
The minimum recorded fixtures, signed-in checks and approved import workflow are still required.
This unit authors no capture, import, cookie, signing or other secret-handling operation.
