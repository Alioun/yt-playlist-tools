# What happens when a video is added?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 01

## Question

Decide the add flow for auto-add, shortcuts, quick-save and the queue:
- **Duplicates:** use YouTube's real "already in this playlist" state. Does "Prevent duplicates" stay a setting?
- **Order:** the order of checks (channel filters, duplicates).
- **Feedback:** what a toast says (naming the playlist and the video), success vs. failure styling, and undo.
- **Failures:** signed out, network, a playlist that's gone, a full playlist, a private video.
- **Concurrency:** two tabs, or auto-add and a shortcut at once.
- **Creating a playlist (approved):** where it's offered, and with which options (title, privacy).

Also from the YouTube Music charting (Q19): Save to playlist on YouTube Music uses this same flow, including the picker that shows where the song already is.

Also from [ticket 01](01-youtube-requests.md):
- **Duplicates:** what a duplicate add does on youtube.com is unknown until [ticket 25](25-live-checks.md).
- **Undo:** remove the exact entry ID the add returned.
- **New playlists:** they can take minutes to appear in listings, and creation is rate-limited (daily caps on public playlists).
- **Success:** read it from `status`, not the HTTP code.

## Answer

Every playlist add goes through one shared flow, whatever triggers it: auto-add, a playlist shortcut, YouTube's thumbnail quick-save, the playlist picker, or Save to playlist on YouTube Music. The queue shares only the feedback rules. This answer fixes behaviour. Which request is sent, and from where, is [ticket 10](10-youtube-access.md)'s call: the flow sees one gateway result per job, whatever route ran it. The triggers belong to tickets [07](07-watched.md), [08](08-shortcuts.md), [14](14-in-page-controls.md) and [26](26-youtube-music-quick-actions.md). Grilled on 2026-10-19 with the user's decisions delegated; judgement calls name their runner-up. It folds in tickets [11](11-accounts.md) and [26](26-youtube-music-quick-actions.md), resolved the same day.

### Terms

These are proposed for `GLOSSARY.md` in the reply. **Quick-save playlist** and **Playlist picker** are ticket 26's terms, used here as it defines them.

- **Add:** one video put into one or more of the user's playlists by a single action of one feature. Add to queue is not an add.
- **Outcome:** what an add did for one playlist. It is one of *added*, *already in*, *filtered out*, *skipped* or *failed*.
- **Membership:** which of the user's playlists contain the video, as YouTube reports it at that moment.
- **Missing playlist:** a chosen playlist that YouTube won't accept adds to any more, because it was deleted or isn't the user's.

### Duplicates

- **A playlist never gets a second copy of a video from the extension, and "Prevent duplicates" is no longer a setting.**
  - The setting was added after 1.4.5 (`f47be35`, 2024-07-22) and never shipped. Its only purpose was to work around a stale local record, which 2.0 removes.
  - 1.4.5 itself had no check: it added a copy every time a video was rewatched past the threshold.
  - *Runner-up:* an "Allow duplicates" option per playlist, off by default. It lost because no released version had it, a playlist used as a rewatch log is a niche case, and a second copy makes membership and undo ambiguous.
- **Membership comes from YouTube at the moment of the add, and there is no local record of adds.**
  - This fixes the friction where adds made elsewhere were invisible and removed videos stayed blocked forever.
  - It also means nothing is written that private windows would have to avoid.
  - 1.5.0's IndexedDB `cachedVideos` store and the older `localStorage.cachedVideos` are deleted on upgrade.
- **Every add starts by reading membership.** One request (`get_add_to_playlist`) covers every target playlist, and the add then goes only to playlists that don't have the video.
  - The same read is the account guard. Its response names the account it answered for, and that's checked before anything is written ([ticket 11](11-accounts.md)).
  - If YouTube also rejects a duplicate add itself, as YouTube Music does, that rejection is read as *already in*. That closes the gap between read and write.
  - *Runner-up:* skip the read and rely on YouTube's own rejection. It would save a request if [ticket 25](25-live-checks.md) shows youtube.com rejects duplicates. It lost because the first response would then come from the write itself, too late to stop a Watch Later add landing in the wrong account.
- **PROVISIONAL until [ticket 25](25-live-checks.md): when membership can't be read.** This covers the case where the account part of the response checks out but the membership part is missing or unrecognised.
  - **An explicit add still goes ahead.** The user asked for it, and the worst case is one visible duplicate.
  - **Auto-add goes ahead only if ticket 25 shows youtube.com rejects duplicate adds itself.** Otherwise it fails, because auto-add is unattended and would add a copy on every rewatch.
  - **A read that fails outright never leads to a write:** network, signed out or account mismatch.
- **Never "Add anyway."** The extension never sends YouTube's skip-the-duplicate-check option (`dedupeOption`).
  - YouTube Music answers a duplicate add with its own toast, "This track is already in the playlist", which has an Add anyway button.
  - That toast must never reach the user. [Ticket 10](10-youtube-access.md)'s dispatch must not run the response's actions.
- **A video the user removed from a playlist on YouTube is auto-added again if they watch it past the threshold again.** That is auto-add's definition. Channel filters and the undo rule below are the ways to stop it.
- **A playlist absent from YouTube's playlist list is still tried.** New playlists can take minutes to be listed, so only the add's own answer can show that a playlist is missing.

### Order of checks

1. **The feature is on and has a target on this account** ([ticket 11](11-accounts.md)).
   - Auto-add with no target does nothing and shows nothing. This fixes the "No auto-add playlists selected" toast that appeared on every video.
   - An explicit add with no target answers with ticket 11's copy, e.g. "{Shortcut} has no playlist on {Name} yet. Choose one in the popup."
   - A quick-save with no quick-save playlist opens the picker in choose mode instead (ticket 26).
2. **Signed in.**
   - If not, auto-add does nothing and shows nothing, which fixes "No access token found" on every video.
   - An explicit add shows "Sign in to YouTube to save videos."
3. **Auto-add only: the session skip.** A playlist whose auto-add of this video was undone or unticked this session is *skipped*, silently (see [Undo](#undo)).
4. **Auto-add only: channel filters.** `.scratch/channel-filters/spec.md` applies unchanged, including the unknown-channel rule. Explicit adds are never filtered.
5. **Membership read and account guard,** then *already in* is settled (see [Duplicates](#duplicates)).
6. **Add** to each remaining playlist.
   - Playlists are handled independently, one request at a time per tab as [ticket 10](10-youtube-access.md) requires. One failure never stops the others.
   - In 1.5.0 a network error silently skipped the remaining playlists.
7. **Report** all outcomes in one toast (see [Feedback](#feedback)).

**Why filters now come before the duplicate check, reversing 1.5.0:**
- 1.5.0's duplicate check was local and its filters could cost quota.
- In 2.0 the filter is free, because the channel is read in the page, and the duplicate check is the network request.
- Filtering first saves a request, and when every playlist is filtered nothing is sent at all.
- *Runner-up:* 1.5.0's order. It lost on cost. The only visible difference is that a playlist that is both filtered and already holding the video reports *filtered out*.

**The account is guarded before every write.** An add always uses the account of the tab it runs in, and that account's setup ([ticket 11](11-accounts.md)).
- **Adds:** the membership read in step 5 must answer for that same account (`datasyncId`) before anything is written. Every later response is checked too.
- **Removals:** an undo or a picker untick starts with the same read.
- **On a mismatch:**
  - nothing is written;
  - the tab sends no further writes until it reloads, and auto-add is disarmed in it;
  - the tab shows ticket 11's message: "Your YouTube account changed in another tab. Reload this page to keep saving here."
- Watch Later is the main risk: its ID means "the current account's Watch Later", so a stale tab would save into the wrong account.

**Settings are read once, when the add starts.** Turning a feature off, or changing its playlists, affects only later adds. An add already under way finishes and reports.

### Feedback

This follows [ticket 26](26-youtube-music-quick-actions.md)'s rules, so YouTube and YouTube Music behave alike. Two additions apply on both sites: hidden tabs and fullscreen.

**Show feedback**

- **Each feature has its own Show feedback switch, shared by all accounts.**
  - **Off** hides confirmations: toasts saying an action did what was asked, and auto-add's "filtered out" note.
  - **Failures, and explicit actions that did nothing (such as "already in"), always show.** An explicit click or key that silently does nothing is a defect, and auto-add's failures are rate-limited (see "Rate-limited failures" under [Feedback](#feedback)), so they stay rare.
  - **The switch governs toasts only.** A control's own state always shows: a picker row, a quick-save or queue button. So do the *Missing* and *Full* marks in settings.
  - *Runner-up (this answer's first draft):* three levels per feature, all / problems only / none. It lost because "none" makes failures silent, failures are already rate-limited, and a switch matches the map's wording and ticket 26.
- **Defaults:**

  | Feature | Show feedback | 1.4.5 upgraders |
  |---|---|---|
  | Auto-add | On | `toastEnabled` true → on, false → off. [Ticket 19](19-upgrade-and-rollout.md) settles what an absent value means. Off now still shows failures, which 1.4.5 never reported. |
  | Playlist shortcuts | On | Same as auto-add |
  | Quick-save (YouTube) | On | n/a |
  | YouTube Music quick actions and their shortcuts | On ([ticket 26](26-youtube-music-quick-actions.md)) | n/a |
  | Add to queue button (YouTube) | Off. The button's own state confirms success, and it has no undo. | n/a |

**Toasts**

- **One toast per add.** It covers every playlist, not one toast per playlist as in 1.x.
- **One toast on screen at a time.** The newest replaces the one showing, as on YouTube and YouTube Music.
- **At most one action:** Undo, or a failure's fix.
- **Partial results:** when an add saved somewhere and failed elsewhere, the toast names both, saves first. It then carries the failure's action instead of Undo. This is rare, and the picker can still undo.
- **Look:** our own toast in each site's look, at the site's toast position (bottom left). The details are tickets [14](14-in-page-controls.md) and [27](27-youtube-music-controls.md)'s.
  - Failures carry an error icon and treatment, never colour alone. This fixes "All toasts look alike".
  - "Already in" and other did-nothing messages are neutral, not failures.
- **Copy rules:**
  - Each toast is one sentence.
  - The video or song title is in double quotes, cut at 40 characters with "…".
  - Playlist titles are unquoted, each also cut at 40.
  - Lists read "Music", "Music and Learning", "Music, Learning and Watch later", or "Music, Learning and 2 more".
  - Failures start with "Couldn't …".
  - YouTube's own words: "Saved to", "Watch later" (YouTube's capitalisation), "the queue". On YouTube Music, "song" replaces "video".
  - Titles come from YouTube's latest answer, else the cache. A playlist whose title isn't known reads "a playlist that's no longer available".
  - This fixes the friction where toasts showed raw video IDs and named no playlist. The trigger supplies the title; if none is known, the toast says "this video".
- **Auto-add names itself** ("Auto-added …", "Couldn't auto-add …"). Its toasts appear without the user doing anything, so they have to say why.
- **Nothing shows twice.** If YouTube or YouTube Music would show its own toast or dialog for one of our actions, the dispatch [ticket 10](10-youtube-access.md) picks must avoid or suppress it. Otherwise YouTube could show a toast the user switched off, or offer "Add anyway".

**Timing**

- **Duration:** 6 s, held while the pointer or keyboard focus is on the toast (ticket 26).
- **Hidden tabs (addition):**
  - A toast's timer runs only while its tab is visible.
  - A toast raised while the tab is hidden waits for the tab to become visible.
  - Only one is held: the newest failure if there is one, else the newest confirmation.
  - Why: auto-add often fires in background tabs, and a failure that expired unseen is the same as none.
  - *Runner-up:* let timers run while hidden, as 1.x did. It lost because background-tab failures would go unseen.
- **Fullscreen (addition):** a toast must be visible in fullscreen, or held until the user leaves it. [Ticket 14](14-in-page-controls.md) chooses which.
- **Pending:** a key-triggered add with no visible button and no outcome after 1 s shows "Saving "{title}" to {list}…". It then turns into the outcome in place. Buttons show their own busy state instead.
- **No answer after 10 s** counts as failed (ticket 26).
- **Navigation:** toasts survive YouTube's in-app navigation, so Undo still works after moving on to the next video. A reload or closing the tab ends them.
- **Rate-limited failures:**
  - **Once per playlist per browser session:** auto-add's *Missing* and *Full* failures.
  - **Once per browser session:** the unknown-channel skip, and YouTube refusing a video. Made-for-kids videos can't be saved at all, so a parent's session would otherwise get one toast per video.
  - **Once per tab:** an account that can't use playlists, and an account change.
  - Repeats are logged to the console only.
- **Console log:** every add logs each playlist's outcome to the tab's console, whatever the switch says. This gives diagnostics without telemetry ([ticket 18](18-breakage.md)).

**Copy**

| Situation | Toast | Action | Shown with feedback off |
|---|---|---|---|
| Explicit add saved it | Saved "{title}" to {list} | Undo | No |
| First pick in choose mode (quick-save) | Saved "{title}" to {list}. One click now saves there. | Undo | No |
| Auto-add saved it | Auto-added "{title}" to {list} | Undo | No |
| Explicit add, already in | "{title}" is already in {list} | — | Yes |
| Auto-add, already in everywhere | *(no toast)* | | |
| Auto-add, all remaining playlists filtered out | Didn't auto-add "{title}": {Channel} is filtered out of {list} | — | No |
| Add to queue (YouTube) | Added "{title}" to the queue | — | No |
| Partial (some saved, some failed) | Auto-added "{title}" to Music. Couldn't add it to Old stuff: it doesn't exist anymore. | The failure's action | Yes |

Failures (all shown with feedback off; "save" reads "auto-add" in auto-add's toasts):

| Situation | Toast | Action |
|---|---|---|
| Signed out (explicit add) | Sign in to YouTube to save videos. | Sign in, to YouTube's sign-in page, which returns here |
| Explicit add with no target on this account | {Shortcut} has no playlist on {Name} yet. Choose one in the popup. | — |
| Offline, so nothing was sent | Couldn't save "{title}" to {list}. Check your connection. | Try again (auto-add only) |
| Sent, but no answer within 10 s | Couldn't confirm "{title}" was saved to {list}. YouTube didn't answer. | Try again (auto-add only) |
| Missing playlist | Couldn't save "{title}": {Playlist} doesn't exist anymore. | Settings (auto-add, shortcuts); Choose (quick-save, as in ticket 26) |
| Full playlist | Couldn't save "{title}": {Playlist} is full. | Settings; Choose (quick-save) |
| YouTube refuses the video (made for kids, private, removed, region-blocked) | YouTube doesn't allow saving "{title}" to playlists. | — |
| Rate-limited (HTTP 429) | Couldn't save "{title}". YouTube is limiting requests, so try again in a minute. | — |
| Account changed in another tab | Your YouTube account changed in another tab. Reload this page to keep saving here. | Reload |
| Account can't use playlists (supervised or Kids-style) | YouTube doesn't let this account save to playlists. | — |
| Unknown channel (allowlist-mode filter) | Didn't auto-add "{title}" to {list}: couldn't tell which channel it's from. | — |
| Unrecognised answer | Couldn't save "{title}" to {list}. Use YouTube's own Save for now. | Try again (auto-add only) |
| Undo failed | Couldn't undo. | — |
| Queue failed (YouTube) | Couldn't add "{title}" to the queue. Try YouTube's ⋮ menu. | — |

- **Try again only on auto-add.** An explicit add is retried by pressing the button or key again; auto-add has nothing to press. Try again re-runs the add for the failed playlists only, starting from the membership read, so an add that was slow but did succeed isn't doubled.
- **Settings and Choose:**
  - **Settings** opens wherever that feature's playlists are chosen ([ticket 09](09-where-things-live.md)), at the playlist. It's marked *Missing* or *Full* there, with Remove.
  - **Choose** opens the picker in choose mode.
  - *Runner-up:* a "Remove from auto-add" button in the toast. It lost because a destructive settings change from a 6-second toast is easy to misread as removing the video.

### Undo

- **Where it's offered:** on every toast for an add that saved something.
- **What it removes:** exactly the entries this add created, in every playlist it added to, and nothing else. It uses the entry IDs the add returned (`setVideoId`, [ticket 01](01-youtube-requests.md)).
  - If an entry ID is missing, it removes the video by ID instead. That's safe, because the add only happened where the video was absent.
  - A video already removed elsewhere counts as removed.
- **Results:** the toast closes once Undo succeeds. If it fails anywhere, the toast reads "Couldn't undo." (ticket 26).
- **Undoing an auto-add also stops auto-add from re-adding that video to those playlists until the browser restarts.** This is held in memory only, and explicit adds ignore it.
  - Why: undo is the user's choice about this video, and re-adding it a minute later on a rewatch would override that choice.
- **After the toast is gone:** untick in the picker (approved 2026-10-20, R84) or use YouTube. The popup's Recent adds list shows what was added (R86).
- **Keyboard:** a keyboard path to Undo, beyond the toast's focusable button, is [ticket 08](08-shortcuts.md)'s call.

### Failures

| Situation | How it's recognised | What happens |
|---|---|---|
| Signed out | The tab's own sign-in state (`LOGGED_IN`), before any request | Auto-add: nothing at all. Signed-out browsing is a deliberate state, not an error ([ticket 11](11-accounts.md)). Explicit add: "Sign in to YouTube to save videos." The picker doesn't open. |
| Offline, or no answer in 10 s | The request couldn't be sent, or its answer never came. This includes ticket 10's `unconfirmed` result for a playlist write. | *Failed*. The add is never re-sent automatically, because a lost answer may hide a save that worked ([ticket 10](10-youtube-access.md): writes never run twice). Try again, or pressing the button or key again, starts with the membership read, which shows whether the first one landed. |
| Missing playlist | YouTube's answer to the add says the playlist doesn't exist or isn't the user's. Absence from a listing doesn't count. | *Failed*, toast rate-limited. The playlist stays chosen, marked *Missing* in settings, and is never removed automatically, since only the user removes their choices. Later adds keep trying it; each try is one cheap request, and that self-heals a wrong mark. The mark clears when the playlist appears in a listing again. |
| Full playlist | YouTube's size-limit error. Playlists hold 5,000 videos, a widely reported but undocumented limit. | Same as a missing playlist, marked *Full*. |
| YouTube refuses the video | YouTube's answer. YouTube doesn't allow made-for-kids videos in playlists or Watch Later. | *Failed*, toast rate-limited. Nothing is marked. |
| Rate-limited | HTTP 429, or YouTube's rate-limit status | *Failed*. All adds for that account pause for 60 s, and adds that start during the pause fail at once without another toast. |
| Account changed in another tab | The membership read, or any later response, answers for a different `datasyncId` than the tab's | *Failed*. Nothing is written, the tab sends no further writes until it reloads, and auto-add is disarmed there. |
| Account can't use playlists (supervised or Kids-style) | The read or the add is refused for the account, rather than for a playlist or video | *Failed*, shown once per tab. After that the tab stops trying for that account: auto-add stays silent, and explicit adds and the picker show the message at once, without a request. Nothing is stored. |
| Just-created playlist | The extension created the target less than 30 s ago and is adding to it separately (a chooser creates empty playlists) | The add waits, showing busy, until the playlist is 30 s old, then sends once. YouTube Music refuses edits to a new playlist for about 20 s ([ticket 21](21-youtube-music-internals.md) research). Waiting avoids that refusal without a retry; youtube.com is unknown. |
| Unrecognised answer, e.g. a changed response shape | No known `status` or shape | *Failed*, with the "Use YouTube's own Save" copy. [Ticket 18](18-breakage.md) decides what more the user sees. |

- **Success is read only from YouTube's `status` field, never from the HTTP code.** 1.4.5 said "Added" even when the add had failed.

### Concurrency

- **One coordinator per browser profile orders all adds,** in the background ([ticket 17](17-modules.md) places it). Adds for the same account, playlist and video run one at a time. The later one resolves against the first one's result:
  - an explicit add then reports "already in";
  - an auto-add then says nothing.
- **Two tabs auto-adding the same video produce one add.** The second is silent. It stays silent for 60 s after the first finishes, in case YouTube's membership answer lags behind the add.
- **Auto-add and a shortcut at once, same playlist:** whichever starts second reports "already in" (shortcut) or nothing (auto-add). That's truthful, because the video is there.
- **Different playlists or videos run independently.**
- **Tabs on different accounts** each use their own account and setup.
- **Repeated presses:** while an explicit add is pending, the same button or key is ignored, and so is key auto-repeat. Once it's done, pressing again reports "already in".
- **Shortcuts and one-click saves never toggle a video out of a playlist.** A hidden remove behind a repeated key would be too easy to trigger.
- **Removals and adds of the same video and playlist are ordered by the coordinator too.** An untick pressed while that row's add is still pending runs after it.
- **Nothing about individual adds is stored.** These live in memory only and go away with the tab or the browser session:
  - locks;
  - undo entries;
  - the session skip;
  - the 60 s memory of recent adds;
  - the "shown once" memory.
- **Private windows** ([ticket 11](11-accounts.md)): when the user lets 2.0 run there, adds work as elsewhere, but nothing from the session is written:
  - no *Missing* or *Full* marks;
  - no locally kept new playlists, which stay in that tab's memory;
  - no remembered visibility;
  - no quick-save playlist set by a first pick.

  The background's write guard refuses these writes ([ticket 17](17-modules.md)).

### Quick-save on YouTube

**[Ticket 26](26-youtube-music-quick-actions.md)'s quick-save model applies to YouTube's thumbnail quick-save as well:**
- **The button:** a split button. One click saves to the **quick-save playlist**; ▾ opens the **playlist picker**.
- **Before a playlist is chosen:** choose mode, which ticket 26 defines. The first pick saves the video and becomes the quick-save playlist.
- **Later picks** through ▾ are one-off. Only the picker's pin, or settings, change the quick-save playlist.
- **Ownership:**
  - YouTube's quick-save playlist is per account, and separate from YouTube Music's.
  - Placement and look are [ticket 14](14-in-page-controls.md)'s.
- *Why the same model:* one rule for both sites, and a mis-pick never silently redirects later saves.
- **One edge on YouTube:** made-for-kids videos can't be saved, so the button isn't drawn where the card or page marks a video as made for kids, if that's detectable ([ticket 14](14-in-page-controls.md)). Otherwise the click gets the refusal toast.

### The playlist picker

Used by both sites' quick-save ▾. On YouTube Music it behaves exactly as ticket 26 describes, and on YouTube the same way. Opening it belongs to the triggers.

- **Order:** the site's own Save-dialog order. On youtube.com, Watch later comes first. A search field, focused on open, narrows the list by title.
- **Loading:**
  - Rows paint at once from the cached playlist list.
  - Membership is fetched fresh each time the picker opens; until it arrives, the check marks show a loading state.
  - Rows work before membership is known. An add then reports "already in" on the row if it was.
- **A check mark means the video is already in that playlist.**
  - **Ticking a row runs an add** for that playlist: membership read, account guard, then the add.
  - **The row shows its own result:** busy, then checked, or an inline "Couldn't save". Nothing in the picker raises a toast (ticket 26), because the row is the feedback and the user is looking at it.
- **Unticking (approved by the user on 2026-10-20, R84):** unticking removes the video from that playlist, as YouTube's own Save dialog does.
  - **The add flow treats an untick as an explicit removal:**
    - **Guard first:** membership read and account guard, never filtered.
    - **Ordering:** the coordinator orders it with any add of the same video and playlist.
    - **What it removes:** if this picker's own tick added the entry, exactly that entry (`setVideoId`). Otherwise whatever YouTube's own Save dialog removes for that playlist: the removal the membership answer offers for that row, so the result matches YouTube's.
    - **Result on the row:** it shows busy, then unchecked, or reverts to checked with an inline "Couldn't remove".
    - **Undo** is ticking again. The video then returns at the end of the playlist, not at its old position.
    - **Unticking an auto-add playlist** also sets the session skip for that video, as Undo does, so auto-add doesn't put it back on a rewatch.
  - **If declined,** checked rows show "Already in" and do nothing.
- **Without membership** (it couldn't be read on either site): no check marks, and the note "Couldn't check where this video already is" ("song" on YouTube Music). Ticking still adds, and "already in" is still reported on the row.
- **Never filtered,** since a pick is an explicit add.

### Creating a playlist

- **Where it's offered:**
  - **In the playlist picker,** as its "New playlist" row. It creates the playlist with the current video or song already in it (`videoIds`), in one request.
    - That avoids YouTube Music refusing edits to a new playlist for about 20 s.
    - The row appears checked.
    - The playlist doesn't become the quick-save playlist unless the picker is in choose mode or the user pins it.
  - **In every playlist chooser in the extension:** auto-add playlists, a shortcut's playlist, and both quick-save playlists. There it creates an empty playlist and selects it for that use.
  - **Nowhere else:** not in toasts, not in channel filters, and never automatically.
- **Fields, matching YouTube's own New playlist dialog:**
  - **Title:** required and trimmed, up to 150 characters, the commonly documented YouTube limit (to confirm in [ticket 25](25-live-checks.md)). `<` and `>` are refused inline with "Titles can't contain < or >", because YouTube Music fails on them.
  - **Visibility:** Private, Unlisted or Public.
  - **Left to YouTube:** description and YouTube's Collaborate switch, to avoid bloat.
- **Default visibility:** Private, as in YouTube's own dialog; after that, the last visibility the user picked on this device.
  - Private never exposes viewing habits, and it avoids YouTube's daily cap on new public playlists.
  - Remembering the last pick means a user who always makes public playlists isn't overridden each time.
- **A title the user already has** is allowed, because YouTube allows it. A non-blocking hint says: "You already have a playlist called {title}."
- **Double submits:** Create is disabled while a creation is pending, so one click makes exactly one playlist.
- **After creating:**
  - The new playlist is checked or selected at once.
  - Its ID, title and visibility are kept locally and shown in every playlist list until YouTube's own listing includes it, or for 24 h, because YouTube can take minutes to list it.
  - Undoing the save (or unticking) removes only the video. The playlist stays, because deleting playlists isn't an approved capability.
- **Failures** show inline in the form, which keeps the typed title, rather than as toasts:
  - **Rate-limited:** "YouTube won't create more playlists right now. Try again in a few minutes."
  - **Public daily cap,** if YouTube's answer tells it apart: "You've reached YouTube's daily limit for new public playlists. Make this one private or unlisted, or try again tomorrow."
  - **No channel:** YouTube requires a channel to make playlists.
    - If the account is known to have none (ticket 11's label has no @handle), the New playlist row says so up front instead of opening the form: "This account needs a YouTube channel to create playlists", with a Create channel link (`https://www.youtube.com/create_channel`).
    - Otherwise, the same message appears when YouTube's answer asks for a channel.
    - Watch Later and existing playlists keep working either way.
  - **Account can't use playlists** (supervised or Kids-style): "YouTube doesn't let this account create playlists."
  - **Signed out:** creating isn't offered, and the chooser says "Sign in to YouTube to create playlists."
  - **No YouTube tab,** from the popup or settings: "Open YouTube to create playlists", with an Open YouTube button. This applies unless [ticket 10](10-youtube-access.md) finds a no-tab route.
  - **Anything else,** including YouTube asking for another step first: "Couldn't create the playlist. Try again, or create it on YouTube."

### The queue: YouTube's thumbnail Add to queue button

- **Not an add:** it needs no sign-in, has no membership or duplicate check, and is never filtered. That follows ticket 11, where the queue works signed out.
- **No undo on YouTube:**
  - YouTube's own Add to queue has none.
  - The queue is visible and editable in YouTube's miniplayer.
  - No researched path removes one entry from YouTube's queue.
  - This differs from YouTube Music's queue undo (ticket 26), and is listed as a new question.
- **Success is shown only once YouTube confirms the video is in the queue.** [Ticket 10](10-youtube-access.md) picks the signal. This fixes "reports success unconfirmed when a queue is already open".
- **Unconfirmed:** when ticket 10's gateway reports `unconfirmed` (the command was sent but no signal came within its budget):
  - **The button** shows a distinct *Sent, not confirmed* state, with its own icon and label.
  - **The toast** shows even with feedback off: Couldn't confirm "{title}" was added to the queue. Check the miniplayer.
  - **Clicking again** sends again. Unlike *Added to queue*, the user may need to retry, and the queue is right there to check first.
- **Button states,** each with an icon and an accessible label, never colour alone:
  - *Add to queue;*
  - *Adding…;*
  - *Added to queue,* which stays on that card until the page changes;
  - *Couldn't add,* for 1.5 s, then back to *Add to queue.* That matches ticket 26's failed state.
- **Clicking a card that shows *Added to queue* does nothing,** which guards against accidental double-adds while browsing a grid.
  - *Why it differs from ticket 26's 1.5 s check mark:* this button's toast is off by default, so its state is the only confirmation and has to last. On YouTube Music the toast with Undo does that job.
  - *Runner-up:* go back to idle after 1.5 s, like 1.5.0's flash. It lost because the user loses track of what they queued.

### Save to playlist on YouTube Music

- **The same flow as YouTube's quick-save and picker:**
  - explicit adds, never filtered;
  - membership read and account guard first;
  - "already in" isn't a failure;
  - Undo removes by `setVideoId`.
- **Membership** comes from YouTube Music's own answer if it carries it, else from youtube.com's ([ticket 21](21-youtube-music-internals.md)). Without either, the picker falls back as described above.
- **Duplicate rejection:** YouTube Music rejects duplicate adds itself, and the extension reads that rejection as *already in*. Its own "Add anyway" toast must never show (see [Duplicates](#duplicates)).
- **Songs only:** ticket 26 limits Save to playlist to songs, so there are no album or playlist saves.

### What carries over and what changes from 1.5.0

- **Kept:**
  - auto-add's channel filtering, and explicit adds never being filtered;
  - the queue button's command;
  - the toasts choice, carried into each feature's Show feedback.
- **Changed:**
  - the duplicate check asks YouTube, and the setting is gone;
  - filters run before the duplicate check;
  - every write is guarded by the account check;
  - there's one toast per add, naming the video and the playlists, with Undo;
  - failures look different from confirmations and still show with feedback off;
  - there are no toasts for unset features or for signed-out auto-add;
  - one failed playlist doesn't stop the others;
  - the queue is confirmed;
  - playlists can be created.

Also from [ticket 18](18-breakage.md): ticket 07's "can't measure" adds a row to the failure copy. The first such video in a session gets a failure toast; three in a row mark auto-add as not working.

## Amendment after ticket 29 (main session, 2026-10-19)

[Ticket 29](29-youtube-queue-undo.md) found a quiet removal for YouTube's queue. Adopted as an improvement:
- **YouTube's Add to queue button gets Undo,** removing exactly the entry it added (by `playlistSetVideoId`, never by video ID). This supersedes "The YouTube queue button keeps its "Added" state and has no undo".
- **Adds also use the quiet route** (`IAE%3D`) when there's already a queue, so YouTube never shows its own "Added to Queue" toast alongside ours, keeping "nothing shows twice".

Both are PROVISIONAL until [ticket 25](25-live-checks.md)'s Q1–Q8 pass. Fallback if the quiet value stops working: keep the add, and suppress our own toast so only one toast shows.

## Settled by the user (2026-10-20)

- **Unticking removes** ([R84](../spec/resolutions.md#the-users-decisions-of-2026-10-20-r84r99)): approved, and its toast carries **Undo**, which puts the video back at the end of the playlist. In the popup's picker sheet, the row reads "Removed · Undo" for 6 s instead. Spec: 02 YT-PK-05, 03 YM-PICK-8.
- **Recent adds** ([R86](../spec/resolutions.md#the-users-decisions-of-2026-10-20-r84r99)): approved, as a popup list of this browser session's adds, so a missed toast can be looked up. Spec: 04 DATA-52.
