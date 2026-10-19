# For the user

Items that need the user, collected while working the map. Clear each one when it's answered.

## Decisions only the user makes

- **The 2.0 name** ([ticket 22](issues/22-name.md)): recommended "Playlist Pigeon for YouTube™", runner-up "Playlist Courier for YouTube™".
- **Unticking in the playlist picker removes the item from that playlist** ([ticket 26](issues/26-youtube-music-quick-actions.md)), as YouTube's own Save dialog does. Is this a capability you want?
- **More YouTube Music quick actions** ([ticket 26](issues/26-youtube-music-quick-actions.md), all feasible per ticket 21): Save to library, Start mix, Go to artist / album. These are new capabilities: in or out?
- **A "recent adds" list** ([ticket 12](issues/12-adding.md)), so a missed toast can be looked up later, e.g. in the popup. This would be a new capability.
- **Live streams and premieres counting for auto-add** ([ticket 07](issues/07-watched.md)), e.g. after N minutes, or credited to the replay. They never fire today, so this would be a new capability. They're left not counting.
- **Keys that work from any tab, or system-wide on Chrome** ([ticket 08](issues/08-shortcuts.md)), e.g. liking the song in a background YouTube Music tab. They'd need browser commands with no default key. This is a new capability; 2.0's keys only work while a YouTube page has focus.
- **Where problem reports go** ([ticket 18](issues/18-breakage.md)): provisionally GitHub issues, but those need a GitHub account. E-mail instead?
- **Settings export and import to a file** ([ticket 16](issues/16-storage-and-sync.md)), for people without browser sync. This would be a new capability.
- **A "Save to ▸" entry in the browser's right-click menu** ([ticket 09](issues/09-where-things-live.md)): a quick-save that leaves YouTube's page untouched. It would need the menus permission. New capability.
- **A toolbar tick when this tab's video was auto-added, and showing "paused" on the toolbar icon** ([ticket 09](issues/09-where-things-live.md)): wanted? On by default?
- **Localisation:** should 2.0's UI be translated? English toasts stand out on a non-English YouTube Music (ticket 26). This would be a new capability.

## Actions only the user can take

- **Run the live-check probe** ([ticket 25](issues/25-live-checks.md)) in Chrome and Firefox while signed in, and paste the reports back.
- **Send the AMO question** ([ticket 23](issues/23-ask-amo.md)) and paste the reply back.

## Decided on the user's behalf, worth knowing

- **The Data API is gone completely** ([ticket 10](issues/10-youtube-access.md)), including the "last resort" fallback from charting Q4. No job needs it, and YouTube's API policies forbid an app that uses both the Data API and YouTube's internal requests.
- **The page may read YouTube's session cookie to sign requests** ([ticket 10](issues/10-youtube-access.md)), only where YouTube's own client can't do the job quietly. Creating a playlist and some reads are expected to need it. Cost: the Chrome Web Store privacy tab declares "Authentication information", plus one privacy-policy line. No `cookies` permission and no faked origins.
- **Minimum versions:** Chrome 121, Firefox 140.
- **"Prevent duplicates" is dropped** ([ticket 12](issues/12-adding.md)): 2.0 never adds a second copy of a video to a playlist, using YouTube's real membership. No released version ever had the setting.
- **Failures always show, even with a feature's feedback off.** Only confirmations can be silenced (tickets 12 and 26).
- **"Watched" now means actually played** ([ticket 07](issues/07-watched.md)): skipping ahead, resume points and ads no longer count. Progress is remembered locally for up to 30 days so long videos can be finished over several sittings, and the miniplayer now counts too.
- **Each auto-add playlist can take Videos, Shorts or both, and override the percentage** ([ticket 07](issues/07-watched.md)), e.g. a 5 % "history" playlist next to a 90 % "finished" one.
- **Shortcuts are caught inside YouTube pages, not as browser commands** ([ticket 08](issues/08-shortcuts.md), ADR-0004). This allows up to 20 named shortcuts that you set and clear in the extension, with nothing reserved while the feature is off. The cost: keys only work while a YouTube or YouTube Music tab has focus.
- **A recurring task for you** ([ticket 18](issues/18-breakage.md)): before each release, run a few minutes of signed-in live check in Chrome and Firefox. No Google account ever runs in CI. A daily signed-out check runs automatically.
- **No remote config or kill switch** ([ADR-0005](../docs/adr/0005-breakage-caught-on-device-fixed-by-releases.md)): YouTube breakage is fixed only by store releases, so Chrome fixes can take days. Users always see which feature isn't working.
- **Svelte alone doesn't make the popup faster** ([ticket 24](issues/24-performance-budget.md)). With shadcn's popover and search loaded up front, it measured slower than today's React popup on a slow CPU. It's fast only because the first view is a light switch list, with everything else loading on demand. Inside YouTube, Bits UI's popover code (about 32 KB) is the biggest cost, so it loads on first use. With everything on, 2.0 should weigh about half of 1.5.0 on YouTube pages.
- **Feature switches sync along with your setups** ([ticket 16](issues/16-storage-and-sync.md)), so a new browser arrives set up and switched on. Each browser keeps its own copy as the truth, because both browsers wipe the synced copy whenever the extension is uninstalled anywhere. Clear All Data resets only this browser unless you tick the box.
