# Live-check probe: what to do

A throwaway extension for ticket 25. It runs checks in your own signed-in YouTube and YouTube Music tabs, then gives you one JSON report per browser to paste back. Remove it when you're done.

**What it may change** (only with **Allow write checks** ticked):
- It creates PRIVATE playlists titled "ytpt probe – safe to delete…" and deletes them again. If a run says CLEANUP FAIL, delete them by hand.
- On youtube.com it adds two test videos to your queue and removes them; the miniplayer stays open.
- On YouTube Music it likes the playing song and unlikes it straight away (only if you haven't liked it), adds queue items and removes them, and moves queue songs and back.

**What the report never contains:** cookie values, SAPISID, auth hashes, `DATASYNC_ID` and other identity values (only "present" and "same / changed"), playlist or song titles, channel IDs. Response bodies appear as shapes only.

## 1. Load it

- **Chrome:** `chrome://extensions` → Developer mode on → **Load unpacked** → choose `probes/live-checks`.
- **Firefox (128+):** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → choose `probes/live-checks/manifest.json`. Then `about:addons` → ytpt live-check probe → **Permissions**: switch on access to www.youtube.com and music.youtube.com if they're off.

A red "ytpt live-check probe" panel appears at the top right of every YouTube page. Nothing runs until you press **Run probe**.

## 2. youtube.com, signed in

1. **Before the run** (each is optional; the report says "skip" and how to do it otherwise):
   - Queue two videos with YouTube's own ⋮ → **Add to queue**. Watch for an "Added to queue" toast. (T29.Q1)
   - Open videos until one plays a pre-roll ad. (T07.1)
   - Press `i` for the miniplayer and let the next video start. (T07.4)
   - Click the probe's toolbar icon once, then press **Alt+Shift+9**. (M4)
   - Panel → **Keys** → tick **Log my key presses**, click the page, press AltGr+Q and AltGr+E (Windows) or Option+N and Option+Q (macOS). (T08.2, T08.3)
2. Open any watch page. Tick **Allow write checks**, press **Run probe**, keep the tab visible for 3–5 minutes.
3. **Watch the screen during the run.** Toast detection is a guess: write any YouTube toast or popup you saw into the panel's **Notes**.
4. After it says "Done": add another video to the queue, drag one, let it play on, close the miniplayer. Note anything odd in **Notes**. (T29.Q5)
5. **Shorts:** open a Short, let it loop once, swipe down 15–20 times (looking for a Shorts ad). Then **Keys** → tick **On Shorts, block…**, press ↓ and `m`, untick, press ↓ and `m` again. Press **Run probe** (writes can be off). (L9, T07.3, T07.5, T08.1)

**Optional extras** (each one: do it, then **Run probe**):
- **Collaborative playlist:** panel → Optional inputs → paste the `list=` ID of a playlist you collaborate on. (T11.4)
- **Sign-out cycle:** Run, sign out, Run, sign back in to the same account, Run. (L7, T11.1)
- **Stale tab:** open a second youtube.com tab, switch account or sign out there, come back to the first tab **without reloading**, press **Stale-tab check**. (T11.5)
- **Brand account or channel you manage:** switch to it, Run. (T11.6, T11.7)
- **Channel switcher:** open youtube.com/channel_switcher, pick an account, write in Notes whether you landed back on YouTube. (T11.8)
- **Hidden tab:** play a video, switch to another tab for 6 minutes, come back, Run. (T07.8)
- **Live stream ending:** keep a live stream or premiere open until it ends, Run. (T07.6)

## 3. music.youtube.com, signed in

1. Play a song you have **not** liked, from an album or playlist, so the queue has 3+ songs.
2. Open the queue panel and drag one song to another place by hand. (T28.2)
3. Click the probe's toolbar icon once and press **Alt+Shift+9**. (M4)
4. Tick **Allow write checks**, press **Run probe**, watch the screen (likes, toasts), note anything odd.
5. Open an album, a playlist, search results and your Library; press **Scan rows** on each. (T26.5)
6. Optional:
   - **Radio:** song ⋮ → Start radio, Run with writes, skip two songs, Run again. (T28.5)
   - **Queue panel states:** Run (writes off is fine) right after a fresh page load before anything plays, with the player page closed, and with the Lyrics or Related tab showing. (T28.6)
   - **Casting (Chrome):** cast to a TV, Run with writes, check the TV's queue. (M5, T26.3, T28.7)
   - Open a big playlist first; the run measures how many songs `get_queue` returns. (T26.7)

## 4. Installed YouTube Music app (if you use it)

Chrome or Edge (and Firefox web apps on Windows): open the installed app. Click the probe's icon (title bar, or ⋯ → Extensions), press **Alt+Shift+9**, tick **Keys → Log my key presses** and press Alt+N on the page, then **Run probe**. (M4, T08.4)

## 5. Firefox

Load it (step 1) and repeat steps 2 and 3. Before the first Firefox run, copy Chrome's **compare code** (shown in Chrome's panel after a signed-in run) into Firefox's panel → Optional inputs → compare code. (T11.1)

## 6. Prompt text (P1) and registered scripts (P2)

**P1** (paste the text into the panel's "P1: prompt text" box, then Run, or paste it into the chat):
- Chrome: Load unpacked `probes/live-checks/prompt-check/chrome`. Copy the permission lines from its **Details** page. Click its icon → **Request music.youtube.com access** → copy the prompt. Remove it.
- Firefox: Load Temporary Add-on `probes/live-checks/prompt-check/firefox/manifest.json`. Copy the lines on its **Permissions** tab in about:addons. If access is off, click its icon → **Request** → copy the prompt. Remove it.
- The probe's own toolbar popup also has **Request access to all youtube.com sites**, which shows that prompt; press **Remove that access again** afterwards.
- Not testable here: the 1.4.5 → 2.0 Firefox update prompt (needs a signed build).

**P2:**
- Chrome: after one run, quit Chrome completely with a youtube.com tab open, reopen it so the tab is restored, and press **Run probe** in that tab without reloading. Then `chrome://extensions` → probe → reload (↻), reload the YouTube tab, Run.
- Firefox: `about:debugging` → probe → **Reload**, reload the YouTube tab, Run. (A browser restart can't be tested: Firefox removes temporary add-ons.)

## 7. Send it back

In each browser, on any YouTube tab: **Copy report**. It holds every page you ran in that browser. Paste it into the chat, one per browser.

Optional (ticket 18): tick **Capture fixtures** in Optional inputs before a run, then press **Download fixtures** and attach the file. It's redacted the same way.

Then remove the probe and the prompt-check extensions.

## Check index

| IDs | What | Where | Needs |
|---|---|---|---|
| ENV, SETUP, CLEANUP | browser, versions, window; the throwaway playlist | both | – / writes |
| L1 | `resolveCommand(playlistEditEndpoint, {commandController})`, success and failure, quiet? | www | writes |
| L2 | `yt-service-request` for get_add_to_playlist, FEplaylist_aggregation, account_menu; create and edit with writes | www | – / writes |
| L3 | cookies-only requests: signed-in answer? write? | both | – / writes |
| L4 | SAPISID readable; hash checked against Origin or X-Origin | both | signed in |
| L5 | get_add_to_playlist and FEplaylist_aggregation shapes | www | signed in |
| L6 | duplicate add, undo by entry ID, remove by video ID | www | writes |
| L7 | `DATASYNC_ID` and the response `datasyncId` | both | – |
| L8 | an appended video shows in the queue panel data | www | writes |
| L9 | `#shorts-player` API, a navigation event per swipe | www | a Short |
| M1 | menu-item Play next / Add to queue, queue replay, now playing | music | writes, a queue |
| M2 | `networkManager.fetch` reads, membership, `datasyncId`; create, save, undo | music | – / writes |
| M3 | like through `handleServiceEndpoint`: sticks, repaints, no toast | music | writes, an unliked song |
| M4 | installed app: `tabs.query`, `executeScript`, registered scripts, popup, command | both | popup click, Alt+Shift+9 |
| M5 | cast state readable | music | – |
| P1, P2 | prompt text; registered scripts after restart and update | both | step 6 |
| T07.1–T07.9 | ads, stitched ads, Shorts ads, miniplayer, Shorts loop, stream end, made for kids, hidden tab, `getVideoData` before play | www | step 2 extras |
| T08.1–T08.5 | Shorts key block, AltGr, Option, keys in app windows; T08.5 is not tested here (ticket 14) | both | Keys box |
| T11.1–T11.8 | `DATASYNC_ID` stability and cross-browser, www vs music, split identities, collaborative playlists, stale tab, labels, brand and manager, channel switcher | both | extras |
| T12.1–T12.6 | duplicate reply (www and music), error replies, membership delay, new-playlist edit lock, the Save dialog's untick command, title length | both | writes (T12.5 read-only) |
| T26.1–T26.8 | Add to queue vs autoplay, Remove on the playing item, cast flag, `handlePlaylistEditEndpoint` toast, which rows have a like button, ID order, `get_queue` size, miniplayer like anchor | music | – / writes |
| T28.1–T28.7 | queue entry fields, manual drag request, moves, server order, radio survival, panel states, casting | music | – / writes |
| T29.Q1–T29.Q8 | YouTube queue: toasts on add, quiet and plain removal, panel remove item, after-effects, Undo timing, panel data location, quiet add | www | – / writes |
| T25.* | request headers per sending place, own-client details, the YouTube Music snippet's checks | both | – |
| HIDDEN-FRAME | not built (ticket 10 made it optional) | – | – |
