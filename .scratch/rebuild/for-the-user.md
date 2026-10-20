# For the user

**The spec is assembled** ([spec.md](spec.md)), and your answers of 2026-10-20 are folded in as [R84–R99](spec/resolutions.md#the-users-decisions-of-2026-10-20-r84r99), with your GatherTube answers as [R120–R139](spec/resolutions.md#gathertube-r120r139). Everything below is what still needs you; the spec's Open items section states the default it uses until you answer.

Items that need the user, collected while working the map. Clear each one when it's answered.

## Decisions only the user makes

- **The 2.0 name** ([ticket 22](issues/22-name.md), round 2): you asked to workshop it again, with a list of options that don't collide. The icon follows the name ([ticket 34](issues/34-icon.md)). Until then the spec keeps "Playlist Pigeon for YouTube™" as a placeholder.

## Actions only the user can take

- **Create three issue labels** on GitHub: `problem`, `youtube-change` and `idea`. The new issue forms in `.github/ISSUE_TEMPLATE/` set them, and GitHub drops a label that doesn't exist (R89).

- **Fix the live AMO listing now (S4)** ([ticket 30](issues/30-market-and-users.md)): edit AMO's description so it links the new 1.4.5 setup guide (`docs/legacy/1.4.5-setup.md`, live once `main` is pushed) instead of "the github readme", and add "2.0, coming soon, needs no credentials". No new version is needed.

- **Run the live-check probe** ([ticket 25](issues/25-live-checks.md)) in Chrome and Firefox while signed in, and paste the reports back. Gather tabs added seven checks (G1–G7); they join the probe before you run it.

## Setup only the user can do (before release, from ticket 19)

- **Chrome Web Store:**
  - a developer account: dedicated Google account, 2-Step Verification, the one-time fee, publisher name, verified contact e-mail, trader declaration;
  - the first upload by hand as Unlisted, plus the listing and privacy tabs;
  - a service account with the Chrome Web Store API, added in the dashboard.
- **AMO:**
  - check the API keys;
  - at launch, edit the listing: name, summary, description, category, homepage, support link, privacy policy, icon, screenshots;
  - a dedicated reviewer Google account with a channel, three playlists, 2-Step Verification and backup codes.
- **GitHub:**
  - enable Pages;
  - create `amo` and `cws` environments with you as approver, and move the store secrets into them;
  - set the per-store variables, and optionally a ruleset for `v*` tags;
  - delete the old Chrome v1.1 secrets.
- **Privacy page:** read and approve the drafted privacy policy (it's published under your name). It names GitHub issues as the only contact, with no support e-mail, as you decided.
- **Cleanup:** shut down any deployed token broker and delete its Google OAuth client.
- **Before each release:** the signed-in live check and the timing test; screenshot videos you own or that are Creative Commons; optionally, beta testers.

## Decided on the user's behalf, worth knowing

- **The Data API is gone completely** ([ticket 10](issues/10-youtube-access.md)), including the "last resort" fallback from charting Q4. No job needs it, and YouTube's API policies forbid an app that uses both the Data API and YouTube's internal requests.
- **The page may read YouTube's session cookie to sign requests** ([ticket 10](issues/10-youtube-access.md)), only where YouTube's own client can't do the job quietly. Creating a playlist and some reads are expected to need it. Cost: the Chrome Web Store privacy tab declares "Authentication information", plus one privacy-policy line. No `cookies` permission and no faked origins.
- **Minimum versions:** Chrome 121, Firefox 140.
- **"Prevent duplicates" is dropped** ([ticket 12](issues/12-adding.md)): 2.0 never adds a second copy of a video to a playlist, using YouTube's real membership. No released version ever had the setting.
- **Failures always show, even with a feature's feedback off.** Only confirmations can be silenced (tickets 12 and 26).
- **"Watched" now means actually played** ([ticket 07](issues/07-watched.md)): skipping ahead, resume points and ads no longer count. Progress is remembered locally for up to 30 days so long videos can be finished over several sittings, and the miniplayer now counts too.
- **Each auto-add playlist can take Videos, Shorts or both, and override the percentage** ([ticket 07](issues/07-watched.md)), e.g. a 5 % "history" playlist next to a 90 % "finished" one.
- **Shortcuts are caught inside YouTube pages, not as browser commands** ([ticket 08](issues/08-shortcuts.md), ADR-0004). This allows up to 20 named shortcuts that you set and clear in the extension, with nothing reserved while the feature is off. The cost: keys only work while a YouTube or YouTube Music tab has focus. Keys from any tab, which you approved on 2026-10-20, are the one exception (below).
- **A recurring task for you** ([ticket 18](issues/18-breakage.md)): before each release, run a few minutes of signed-in live check in Chrome and Firefox. No Google account ever runs in CI. A daily signed-out check runs automatically.
- **No remote config or kill switch** ([ADR-0005](../../docs/adr/0005-breakage-caught-on-device-fixed-by-releases.md)): YouTube breakage is fixed only by store releases, so Chrome fixes can take days. Users always see which feature isn't working.
- **Svelte alone doesn't make the popup faster** ([ticket 24](issues/24-performance-budget.md)). With shadcn's popover and search loaded up front, it measured slower than today's React popup on a slow CPU. It's fast only because the first view is a light switch list, with everything else loading on demand. Inside YouTube, Bits UI's popover code (about 32 KB) is the biggest cost, so it loads on first use. With everything on, 2.0 should weigh about half of 1.5.0 on YouTube pages.
- **Feature switches sync along with your setups** ([ticket 16](issues/16-storage-and-sync.md)), so a new browser arrives set up and switched on. Each browser keeps its own copy as the truth, because both browsers wipe the synced copy whenever the extension is uninstalled anywhere. Clear All Data resets only this browser unless you tick the box.
- **"Off costs nothing" is per feature, with one shared core per site** ([ticket 17](issues/17-modules.md)). A switched-off feature's own code never loads. But while any feature on a site is on, that site's small shared core loads too, and it holds code other features use: for example, about 3 KB of unused key and card code when only auto-add is on. A site with everything off still gets nothing.
- **Upgraders keep what 1.4.5 actually did** ([ADR-0009](../../docs/adr/0009-upgraders-keep-what-1-4-5-did.md)): 1.4.5 auto-added at 0 % unless set, even though its popup showed 50 %, so the upgrade note asks you once. Since your S1 answer, upgraders whose 1.4.5 never got access default to 50 % instead (R96).
- **Nothing runs until you agree** ([ADR-0010](../../docs/adr/0010-one-consent-gates-every-feature.md)): one consent of our own, in every browser.
- **Rollout:** a beta of at least 14 days (`1.99.N`, served from this repo's GitHub Pages, so don't rename the repo while betas are installed), then Firefox, a 7-day soak, then Chrome public. 2.0.0 can't usefully be rolled back on AMO, so it's fixed forward.
- **AMO question settled without sending it** ([R83](spec/resolutions.md#after-the-spec-firefox-prompts-and-data-collection-r83)): from Mozilla's permission-messages KB and docs. 2.0 declares no data collection, settings sync isn't collection, and the Firefox prompt strings are known exactly. The one residual risk: a strict reviewer counting the page reading YouTube's session cookie as "access to cookies". The live check may make that moot, and a fallback is ready.

### Details filled in while folding in your 2026-10-20 answers

You answered the principles; these are the details settled to build them ([R84–R99](spec/resolutions.md#the-users-decisions-of-2026-10-20-r84r99)). Say if any should go another way.
- **Unticking in the picker:** the toast "Removed “…” from {playlist}" carries Undo, which puts the video back at the end of the playlist, since its old position can't be restored without more of YouTube's internals. In the popup, which shows no toasts, the row reads "Removed · Undo" for 6 s (R84).
- **The four more YouTube Music actions:** every button off and every key unset by default. They sit after the five existing buttons, so switching one on never moves a button you know. Start mix replaces the queue as YouTube Music's own does, so it has no Undo, says "(replaces the queue)" in its tooltip, and is unavailable while casting. Save to library works like Like: no toast on a click, a toast with Undo on a key (R85).
- **Recent adds:** a clock button in the popup's header opens it. It lists the account in view's adds since the browser started, up to 50, with links to the video and playlists. It's on by default, with a switch in Settings › Privacy & data, because it changes nothing on any page (R86).
- **Keys from any tab:** exactly the three you named: save the playing song to its quick-save playlist, like or unlike it, and save the current video to Watch later. More can come in 2.x. A key pressed in another tab answers with a ✓ or ✕ on the toolbar icon for 3 s, and the full message waits in the tab that acted. While the feature is off, its three keys stay listed in the browser's shortcut settings without keys, and do nothing (R88).
- **Report a problem:** three kinds (a feature says it isn't working, something went wrong, an idea), each with its direction, plus a feature choice. GitHub's page receives the version, browser, feature and status when it opens, and the chooser shows them first; the diagnostics report goes in only by pasting. AMO's "no data collection" stays, with a ready fallback that drops the version and browser from the address if a reviewer objects (R89).
- **The settings file:** it holds the shared settings and every account's setup, never consent, cached lists or watch progress. Importing replaces the settings and the setups of the accounts in the file, and keeps others (R90).
- **Save from the browser's menu:** on youtube.com only, with three fixed items: Quick-save playlist, Watch later, and Choose a playlist…. Chrome can't rebuild a menu per tab before it opens, so the items can't name the account's playlists. Its `contextMenus` permission is optional and asked when you switch it on, with no prompt in either browser (Chrome lists no warning for it; Firefox has no message for it and grants such a permission silently), and it's given back when you switch the feature off (R91).
- **The toolbar marks:** "paused" shows as a slate "II" on every tab, and the tick as a teal ✓ on the tab whose video was added. The "!" comes first, then "paused", then the tick (R92).
- **Translation-ready:** every string comes from one message file, the manifest's included, and layouts allow 40 % longer text. Only English ships (R93).

### Details filled in while folding in GatherTube

You chose the destinations, the Shuffled order, all three automatic triggers, and the running-cost limits; these are the details settled to build them ([R120–R139](spec/resolutions.md#gathertube-r120r139), [02 §2.16](spec/02-youtube.md#216-gather-tabs)). Say if any should go another way.
- **"A window reaching N video tabs" defaults to 10,** from 5, 10, 15, 20, 30 or 50, and then gathers every video tab in that window except the one you're on, pinned tabs and tabs playing sound. Recommended as is: ten is well above the few videos someone opens to watch next. The alternative, gathering only the oldest tabs to bring the window back under N, leaves an unpredictable set open (R131).
- **"Opened in the background" turns a middle-click on a video into "save for later and close"** a second after the tab loads, unless you switch to it first. That's what the trigger means, so its option says it in those words. Tabs your browser restores at start never count; how each browser reports them is a live check (G6) (R130).
- **"Unvisited for a while" can run hours late,** because nothing checks on a timer: it looks when you open the popup, when a YouTube page with one of its features loads, or when the browser starts. Its option says so (R129).
- **A gather you start closes the tab you're on too,** if it's a video tab and Close gathered tabs is on, as GatherTube did. Automatic gathering never does (R124, R132).
- **Gathering into a playlist checks each video's playlists first,** one request per video, as every save does, so it never adds a second copy. An automatic round takes at most 50 videos. Batched adds go 50 at a time, pending live check G1 (R126).
- **YouTube's queue takes up to 200 videos a gather,** pending live check G3; 100 were tested. More stay open, and the result says how many (R123).
- **Undo for a gather into a playlist** removes what it added and reopens the tabs it closed. Chrome loads them again; Firefox reopens them asleep (R127).
- **Nothing new to approve in the stores:** no new permission and no new prompt. The consent text gains one line about reading a window's YouTube tabs, and Chrome's single-purpose statement now names gathering; 2.0 hasn't shipped, so consent stays at version 1 (R138).
- **Credit to GatherTube by Karim Elgazar** shows on the feature's Settings card, in Settings › About, in both store descriptions and in the 2.0.0 release notes. Nothing is copied, so no licence notice is needed (R138).
