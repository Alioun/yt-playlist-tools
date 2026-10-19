# Rebuild (2.0)

Labels: wayfinder:map

## Destination

A spec at `.scratch/rebuild/spec.md` for 2.0 of this extension: a ground-up rebuild that keeps every capability and adds YouTube Music quick actions. It works through the user's own YouTube session, puts UI/UX first, and lets the user switch off any part of it. Every decision is settled and it's ready to hand to `/to-tickets`.

## Notes

- **Domain:** vocabulary in `GLOSSARY.md`. Today's behaviour, YouTube usage and friction are in [inventory.md](inventory.md), the parity checklist. Read it instead of re-exploring the old code.
- **Skills:** grilling tickets call `grilling` + `domain-modeling`. The architecture tickets (17, 18) also call `codebase-design`. Research tickets call `research`; prototype tickets call `prototype`.
- **Working style:** use subagents freely for research, planning and implementation, and fan independent work out in parallel. When anything is unclear, ask the user rather than guess.
- **Settled while charting (2026-10-19):**
  - **Scope.** Only the functionality is fixed. Every capability a user has today survives; UI, placement, wording, defaults, architecture and libraries are all open. Improvements that make an existing capability easier or better are actively sought. A genuinely new capability needs the user's go-ahead first.
  - **Approved new capabilities:** Watch Later as a target; quick-save from thumbnails; a separate setup per YouTube account; several shortcuts, each to its own playlist; settings sync across browsers; auto-add on Shorts; creating playlists from the extension; the YouTube Music section (see below).
  - **AMO reviews 2.0 answers:** "Could you update it for latest Firefox and YouTube?" and "Would be cool to have multiple 'Add to playlist' shortcut options. And maybe with some manual labels/titles?"
  - **Same extension.** 2.0 ships from this repo as the next major version: an update on the same AMO listing and gecko ID, plus a first Chrome Web Store listing.
  - **Local first** ([ADR-0001](../../docs/adr/0001-youtube-access-through-the-users-session.md)). No server of ours: the token broker in `server/` retires. No Google Cloud app in the normal path. Settings stay in the browser. The Data API fallback was later withdrawn ([ticket 10](issues/10-youtube-access.md)): no job needs it, and YouTube's API policies forbid mixing it with internal requests.
  - **Never drive YouTube's visible UI to do work.** Use YouTube's own client machinery (the requests and app-state handlers its UI uses), as Add to queue does. On YouTube Music this includes writing to the app's queue state the way its menu handler does ([ticket 21](issues/21-youtube-music-internals.md)). (1.2 clicked through the Save dialog and broke with layout changes.) Opening YouTube's ⋮ menu on right-click is the feature itself, so it's exempt.
  - **Upgrading 1.4.5 users:** carry over auto-add playlists, the shortcut playlist and key, the watch percentage and the toasts setting; delete the tokens, client ID and secret; show a one-time "no Google credentials needed anymore" note.
  - **Inside YouTube, look like YouTube.** In-page UI follows YouTube's own theme, type, shapes and motion. The popup and settings use the extension's design system.
  - **UI is decided through clickable prototypes:** first throwaway pages with realistic fake data in the candidate component library, then a rough dev build on real YouTube for in-page parts once the look is agreed.
  - **Today's friction counts as defects** 2.0 must fix (inventory.md, "Friction").
  - **Browsers:** desktop Chrome and Firefox, MV3. Chromium browsers ride along on the Chrome build.
  - **Tooling:** WXT, TypeScript and Bun stay. Tests run on `bun test`, not Vitest. The UI is Svelte 5 with shadcn-svelte / Bits UI ([ADR-0002](../../docs/adr/0002-svelte-and-bits-ui.md)).
  - **Modular, opt-in, never bloated (the user's principle):**
    - Every part of 2.0 is a feature the user can switch off.
    - A switched-off feature leaves no trace: nothing drawn on the page, no code loaded there, no settings in the way.
    - Changing how YouTube or YouTube Music looks is always the user's choice. Someone can use only auto-add and shortcuts and keep YouTube untouched.
    - Defaults never override what the user chose, and there's no behaviour the user can't turn off.
    - **Settled 2026-10-19 (Q22–Q25; the user delegated with "you have the shared understanding", so the recommended answers were taken):**
      - **The word:** each switchable part is a **feature** (glossary).
      - **What counts as a feature:** anything that does something on its own, with its options inside it.
        - YouTube: auto-add (channel filters inside it), playlist shortcuts, thumbnail quick-save, the thumbnail Add to queue button, the right-click card menu, and whatever ticket 09 puts on the watch page.
        - YouTube Music: quick actions (each button chosen separately) and quick-action shortcuts.
        - Global: settings sync.
      - **Feedback:** toasts aren't a feature; each feature has its own "show feedback" option.
      - **First run:** every feature starts off. A first-run screen, which doubles as the store consent screen, lets the user tick what they want, so nothing on YouTube changes until it's chosen. 1.4.5 upgraders keep auto-add and their shortcut on once they accept; everything new starts off.
      - **Off costs nothing:** a switched-off feature injects no code, CSS or elements, and its settings collapse to a single row with its switch. Page scripts are registered per feature only while it's on (the `scripting` permission returns for this; it carries no install warning on Chrome).
  - **YouTube Music (added 2026-10-19, Q14–Q21):**
    - **The quick actions** use YouTube Music's own names: Play next, Add to queue, Save to playlist (one click, plus a picker showing where the song already is), Like / unlike, and Remove from queue.
    - **Where they appear:** inline hover buttons on song rows and cards, on the player bar, and as keyboard shortcuts (hovered row, else the playing song).
    - **Buttons:** the user picks which inline buttons show (default: Play next and Add to queue).
    - **Albums and playlists:** they work too.
    - **Carried over:** playlist shortcuts and quick-save work there. Auto-add and channel filters stay YouTube-only.
    - **In the app:** YouTube Music gets its own tab or section with its own switch, buttons and shortcuts.
    - **Installed app:** the YouTube Music app is first-class if extensions run in it.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md): gist -->

- [Which YouTube-internal requests can do each job?](issues/01-youtube-requests.md): every job has a session request, so no Data API is needed. Playlists, Watch Later and membership come from `get_add_to_playlist`; adds, undo and create from `edit_playlist`/`create`; typed channels including `/c/` from `resolve_url`; the account from `ytcfg` `DATASYNC_ID`. Reads and create need the `SAPISID` auth hash unless YouTube's own `yt-service-request` route works ([ticket 25](issues/25-live-checks.md)). Detail on branch `research/youtube-requests`.
- [What do store policies and YouTube's terms allow?](issues/03-store-policy.md): both stores allow working through the user's session (listed precedents exist). Chrome forbids "YouTube" as the name, which led to [ticket 22](issues/22-name.md). The Data API fallback is nearly unavailable under YouTube's API policies. No `cookies` permission, no faked origins, no remote config. Chrome needs a privacy policy, disclosures and an in-product consent. Detail on branch `research/store-policy`.
- [Which UI stacks are worth considering?](issues/05-ui-stacks.md): keep shadcn/ui on Base UI (best shadow-root support, zero-setup `bun test`). The alternatives are shadcn on React Aria (better a11y testing, weak shadow DOM) and Svelte 5 + Bits UI (half the JS, full rewrite). One stack with a YouTube skin for in-page UI. The choice is the user's in ticket 13, weighed against [ticket 24](issues/24-performance-budget.md)'s budget. Detail on branch `research/ui-stacks`.
- [What happens when a 1.4.5 user updates to 2.0?](issues/06-upgrade-path.md): the Firefox update is silent while origins stay under `*://*.youtube.com/*`, because MV3 updates never grant new host permissions. Run the migration from stored state on every start, not from `onInstalled`. 1.4.5's real defaults were 0 % and toasts off. Lists the AMO and Chrome Web Store submission requirements, and `release.yml` must move to Web Store API v2. Detail on branch `research/upgrade-path`.
- [Can `bun test` cover a WXT extension?](issues/04-bun-test.md): yes, with a `bunfig.toml`, three preloads (fake browser, happy-dom, Testing Library) and `--isolate`, on Bun ≥ 1.4.3. WXT stays at the entrypoints, auto-imports go off, and dependencies are injected. No branch coverage, and nothing that needs the build or a real browser. Detail on branch `research/bun-test`.
- [Where can the extension send those requests from, and with which permissions?](issues/02-request-context.md): from the YouTube tab's MAIN world (a manifest `world: "MAIN"` script; Firefox 128+), with popup and settings requests routed through a live YouTube tab. YouTube rejects extension origins with 403, so with no tab open only cached data is available unless a hidden frame works ([ticket 25](issues/25-live-checks.md)). Permissions: `storage` + youtube.com, with no install or upgrade prompt beyond that. Detail on branch `research/request-context`.
- [Which UI stack?](issues/13-ui-stack.md): Svelte 5 with shadcn-svelte on Bits UI (the user's call), one stack with a YouTube skin for in-page UI. See [ADR-0002](../../docs/adr/0002-svelte-and-bits-ui.md).
- [Which YouTube Music internals can do each music action?](issues/21-youtube-music-internals.md): every action works from a page script in a YouTube Music tab. Play next and Add to queue must repeat the menu handler (`get_queue`, then write the app's queue state). Likes must go through the page because of a bot check. Membership comes from youtube.com. Every Alt combination is free. Don't depend on the player bar, which a running A/B test removes. Detail on branch `research/youtube-music`.
- [How do per-account setups work?](issues/11-accounts.md): an account is what `ytcfg.DATASYNC_ID` identifies (a Google or brand account). An account setup holds only the choices that name its playlists; everything else is shared. 2.0 never switches accounts. A 1.4.5 setup stays unclaimed until an account owning its playlists claims it after consent. Private windows never write setups. See [ADR-0003](../../docs/adr/0003-account-setups-keyed-by-datasync-id.md).
- [How do YouTube Music quick actions behave?](issues/26-youtube-music-quick-actions.md): two features, both off until picked: Quick actions (buttons; Play next and Add to queue by default) and Quick-action shortcuts (Alt+N/Q/P/Shift+P/L/R). An action is offered exactly where YouTube Music's own ⋮ menu offers it. Nothing depends on the player bar; only Save sits beside YouTube Music's like button. Albums and playlists go in as one block; Save is a split button with a quick-save playlist and a picker; our own toast with Undo. Unticking in the picker removes the item: PROVISIONAL, pending the user.
- [How does the extension talk to YouTube?](issues/10-youtube-access.md): every request goes out from an open YouTube or YouTube Music tab's page, as that tab's account. YouTube's own client signs wherever it stays silent; otherwise the page signs from the session cookie, disclosed as "Authentication information". No tab means cache plus Open YouTube. No hidden frame and no Data API, ever. Permissions are `storage`, `scripting` and YouTube hosts (Firefox keeps `*://*.youtube.com/*` for a silent upgrade); page scripts are registered per feature at runtime. Floors are Chrome 121 and Firefox 140. The per-job routes are PROVISIONAL until [ticket 25](issues/25-live-checks.md) fills its table. See [ADR-0001](../../docs/adr/0001-youtube-access-through-the-users-session.md) (revised).
- [What happens when a video is added?](issues/12-adding.md): one add flow for auto-add, shortcuts, quick-save, the picker and YouTube Music's Save. It asks YouTube for membership first, which doubles as the account check. 2.0 never adds a second copy, so "Prevent duplicates" is dropped. Order: feature/target → signed in → undo-skip → filters → membership → add → one toast. Show feedback per feature hides only confirmations; failures always show. Undo removes exactly what was added. Creating playlists is offered in every chooser (Private by default). The queue shows "Sent, not confirmed" unless confirmed.
- [When does auto-add count a video as watched?](issues/07-watched.md): watch progress is what was actually played, each part once, at any speed; seeking, resume points and ads don't count. The goal is required percentage × length (≥1 s, ≤ length − 2 s). Only the watch player (including the miniplayer and queue) and the Shorts player count; previews, clips, made-for-kids, live and premieres don't. Each playlist takes Videos/Shorts/Both and may override the shared default percentage (50 %). Progress is remembered locally for up to 30 days. Controls: the feature switch, Pause (until restart), "Don't auto-add this video". Stitched-ad detection is PROVISIONAL.
- [Can a song already in the queue be moved to play next?](issues/28-queue-reorder.md): yes, by firing YouTube Music's own `ytmusic-reorderable-list-drop` on the queue panel, which also updates the server copy. Medium fragility, so confirm the position afterwards. Adopted into ticket 26: on queue items, Play next and Add to queue move the item, with Undo. Detail on branch `research/queue-reorder`.
- [How do keyboard shortcuts work?](issues/08-shortcuts.md): every key is caught inside YouTube and YouTube Music pages, only while a shortcut feature is on, with no browser `commands` ([ADR-0004](../../docs/adr/0004-shortcuts-caught-in-page.md)). "Playlist shortcuts" holds up to 20, each with a key and optional label (shared) and a playlist per account. The preset is Alt+W → Watch later, on every account. Alt+Shift+P opens the picker; Alt+U undoes the toast. A key acts on the pointed-at item, else the current video or playing song. The recorder can cancel and clear, and warns on clashes. "Labels/titles" means titles not IDs, per-shortcut names, and keys shown in the picker.
- [How do we find out when YouTube breaks us?](issues/18-breakage.md): `bun test` replays recorded YouTube responses through one page port. A daily signed-out CI watch (bundle check plus a headless browser) runs, and the developer runs a signed-in live check before each release, with no Google account in CI. At runtime, breakage signals give each feature a working / partly / not working status, always shown (notice, amber badge, status line). Diagnostics are local and copied by choice. Fixes ship only as releases, through a hotfix lane with no remote config ([ADR-0005](../../docs/adr/0005-breakage-caught-on-device-fixed-by-releases.md)).

## Not yet specified

- Visual detail past what the prototypes settle: motion, iconography, empty-state and error copy.
- Edge cases the access research will expose: private, deleted, age-restricted or members-only videos; playlist size limits; supervised accounts that can't edit playlists.
- Accessibility beyond the component library's defaults.

## Out of scope

- Firefox for Android, Safari and m.youtube.com: 2.0 targets desktop browsers only (ruled while charting).
- Any server we run, and any shared Google Cloud app (ruled while charting; see ADR-0001).
- Building 2.0 and slicing the spec into build tickets: that starts after the destination.
