# How do the popup and settings look?

Type: prototype
Status: open
Labels: wayfinder:prototype
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 08, 09, 11, 13

## Question

Prototype the popup and the settings page in the chosen stack, with realistic fake data. Cover:
- picking playlists: search, Watch Later, and a long list;
- channel filters;
- shortcuts and their labels;
- per-account setups;
- sync;
- theme;
- resetting data;
- first run;
- the upgrade note.

Also from [ticket 03](03-store-policy.md):
- Include the first-run disclosure and consent screen.
- The extension's own UI must not imitate YouTube's look and feel, so YouTube red can't stay as the primary colour.

Also include:
- the YouTube Music tab: its on/off switch, the choice of inline buttons, and its shortcuts;
- the feature switches from the modularity principle (map Notes).

Also from [ticket 21](21-youtube-music-internals.md): a side panel won't open in Chrome's installed-app windows, so YouTube Music app users need everything reachable from the popup.

Also from [ticket 01](01-youtube-requests.md): a picker with thumbnails and counts needs two requests (`get_add_to_playlist` plus `FEplaylist_aggregation`) and a cache.

Also from [ticket 11](11-accounts.md):
- **Account header:** avatar, name and @handle, with a placeholder while loading (never a signed-out flash).
- **Viewing another account's setup:** a picker only when two or more setups exist, only in normal windows, and never worded as "switch".
- **Settings:** an Accounts list with Remove.
- **States:** signed out, private-window read-only, the unclaimed 1.4.5 setup (Switch account / Discard) and the claim notice. The copy is in ticket 11's answer.

Also from [ticket 22](22-name.md) (name PROVISIONAL: "Playlist Pigeon for YouTube™"):
- Replace 1.5.0's YouTube play-button logo (`src/components/YouTubeIcon.tsx`) and its YouTube-red primary colour.
- The extension's own brand is a grey pigeon with a teal-to-violet accent: no red and no play triangle.
- Show the attribution line where the extension names YouTube.

Also from [ticket 26](26-youtube-music-quick-actions.md):
- **YouTube Music features:** Quick actions has six button checkboxes; Play next and Add to queue are on by default. Quick-action shortcuts has the key list.
- **Quick-save playlist:** shows under whichever of the two is on.
- **Proposed:** a "playing" row in the popup with Save and the picker, reachable from the installed app's title bar.

Also from [ticket 10](10-youtube-access.md):
- **No tab:** cached data plus "Open YouTube" / "Open YouTube Music".
- **Site access:** a "needs access" state per site.
- **Chrome's YouTube Music access:** requested from the click that switches a YouTube Music feature on, including on the first-run screen.

Also from [ticket 12](12-adding.md):
- a Show feedback switch per feature;
- the New playlist form: title rules, Private/Unlisted/Public defaulting to Private, a hint for an existing title, inline errors, and the no-channel state;
- Missing/Full marks with Remove in the playlist lists;
- a quick-save playlist per site, per account;
- adds started from the popup report inline.

Also from [ticket 07](07-watched.md):
- **Default required percentage:** a 0–100 slider plus a field that saves on Enter, on leaving the field, or on slider release, labelled "As soon as it starts playing" / "Only when watched in full".
- **Per playlist:** Takes (Videos / Shorts / Both) and a percentage override.
- **In the popup:** Pause auto-add and "Don't auto-add this video".

Also from [ticket 08](08-shortcuts.md):
- **Playlist shortcuts list:** label, playlist per account (Watch later applies to every account), key, Remove with Undo, at most 20. Managed in the popup and in settings.
- **Recorder:** its states and copy; Esc cancels, Clear, clash warnings, "Use it here".
- **Keys:** shown in each platform's style, with the help line.
- **Also on YouTube Music:** the switch is reachable from the YouTube Music section.

Also from [ticket 18](18-breakage.md):
- a status line under each feature: working / partly working / not working;
- a popup strip when something isn't working;
- the amber "!" badge (the missing-access badge takes priority);
- a Diagnostics section: Check now, report preview, Copy, "Known problems" / "Report a problem" links, and a detailed-log toggle.

Also from [ticket 24](24-performance-budget.md):
- **The popup's first view** is the switch list, painted from one storage read, in at most 40 KB and a 60 ms first frame. Pickers, search, the account view and Diagnostics load lazily.
- **Lighter helpers:** `tailwind-variants/lite` and `clsx`, not shadcn's full helpers.
- **Settings page:** 60 KB and a 100 ms first frame (PROVISIONAL), with Diagnostics a lazy section.
