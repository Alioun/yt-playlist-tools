<!--
AMO reviewer notes (approval_notes) for major and minor releases (REL-STORE-21).
scripts/amo-metadata.ts strips these comments, fills the {…} placeholders and
refuses to write the file while one is left. The test-account values come from
the reviewer credentials, which aren't wired into CI yet (G28).
-->
What this is
2.0 is a ground-up rewrite of YouTube Playlist Tools, renamed Perchling for YouTube™, with the same add-on ID and slug. 1.x used the YouTube Data API with each user's own OAuth credentials. 2.0 drops that entirely. It has no identity permission, no Google hosts and no server.

How it works
- Every request goes from an open youtube.com or music.youtube.com tab, through the user's own signed-in session, to youtube.com itself.
- Each site gets two registrations, both made at runtime with scripting.registerContentScripts and only while a feature for that site is on:
  - a world: "MAIN" gateway that calls YouTube's own client code;
  - an isolated-world list with the site core, the UI kit (only if a switched-on feature draws), then one file per switched-on feature.
- When the user switches a feature on, scripting.executeScript injects the same files into tabs of that site that are already open, so no reload is needed. It also loads the playlist picker (popovers.js) on first use. When the popup or settings needs an account or fresh data (playlists, or the song playing) from a tab that has none of our code, it injects the gateway and site core alone into that one tab, and that core draws nothing. The gateway's job code is a second world: "MAIN" file, page-jobs-www.js or page-jobs-music.js. scripting.executeScript injects it into a tab the first time that page runs a job, so a page that never runs one doesn't load it. After an extension update, the start-up run registers the scripts again and injects the current files into open tabs, and the older copies there retire themselves. Nothing is injected before the user clicks Agree.
- There are no static content scripts and no web-accessible resources.
- Two opt-in features register nothing at all. "Keys from any tab" declares three commands with no suggested key, which the user binds in Firefox's shortcut settings. "Save from the browser's menu" adds a Save to ▸ menu entry through the optional contextMenus permission, which it requests when the user switches it on and removes when they switch it off. When either is used, the gateway, core and UI kit are injected into that one YouTube tab with scripting.executeScript, to run the save there and show its message.
- Gather tabs reads the YouTube tabs of one window with tabs.query({ windowId, url }), which host access allows without the tabs permission. It opens YouTube's own watch_videos list in a tab, or adds the videos to YouTube's queue or a playlist through the routes below, then closes those tabs with tabs.remove if the user asked. Its optional automatic triggers use no alarm and no tab or window listener. On watch pages only, while a trigger that needs it is on, the site core tells the background whether the page loaded in the background.

Routes, in order of preference
1. YouTube's own command resolver, found by shape on first use and cached for the page. It is the first default_kevlar_base.<key> whose instance.resolveCommand is a function.
2. YouTube's yt-service-request action.
3. YouTube Music's own ytmusic-app handlers (networkManager.fetch, app.queue).
4. Only where none of these can do a job quietly, a same-origin fetch to /youtubei/v1/… that the page signs from YouTube's session cookie the same way YouTube's code does (SAPISIDHASH).
<!-- PROVISIONAL on ticket 25 (R48): if no shipped route reads the session cookie, route 4 becomes the same request without signing, and SAPISIDHASH goes. -->

Public data that needs no account, such as looking up a typed channel or a video's channel when the page doesn't show it, uses the same same-origin fetch without signing.

There is no cookies permission, no Origin rewriting, and no remote code, config or selectors.

Endpoints
playlist/get_add_to_playlist, browse (FEplaylist_aggregation and channel pages), browse/edit_playlist (with several actions per request when gathering), watch_videos (opened as a page, never fetched), playlist/create, account/account_menu, navigation/resolve_url, next, reel/reel_item_watch, music/get_queue, YouTube's queue commands through its resolver (addToPlaylistCommand for the queue, playlistEditEndpoint on the queue list, refreshPlaylistCommand), and like and queue commands through YouTube Music's handlers.
<!-- PROVISIONAL: the final list is ticket 25's route table (06 §6.2.6 and §6.2.7). -->

Permissions
- storage holds the settings.
- scripting registers each feature's scripts, and reads from an open tab for the popup.
- https://www.youtube.com/* is the only site requested at install.
- https://music.youtube.com/* is optional. Perchling requests it only when the user switches on a YouTube Music feature, extends playlist shortcuts to YouTube Music, or switches on keys from any tab.
- contextMenus is optional, and held only while "Save from the browser's menu" is on.

Data collection: none
Nothing is sent to the developer or any third party. The only requests are YouTube's own, from the user's YouTube tab, for actions the user takes or for auto-add, which the user switches on. Route 4 reads YouTube's session cookie in that tab only to sign requests that go to YouTube itself. The cookie is never stored, logged or sent anywhere else.
<!-- PROVISIONAL on ticket 25 (R48): the two cookie sentences above go if no shipped route reads the session cookie. -->
Settings sync is off by default and uses the browser's own storage.sync, which the developer never sees. A first-run screen discloses all of this and requires an explicit Agree before any feature runs. "Report a problem" only opens GitHub's new-issue page in a tab, with the version, browser, feature and status filled in for the user to see. Nothing reaches the developer unless the user submits the issue on GitHub.

Private windows
Nothing from a private session is written to any storage area. One guarded write path in the background enforces this.

Source
See SOURCE_CODE_REVIEW.md in the sources zip. Bun 1.4.3 installs the dependencies (npx --yes bun@1.4.3 install --frozen-lockfile), and the build itself is npm run build:firefox on Node. CI rebuilds the sources zip this way on ARM64 and x86-64 and checks that the output is identical.

Test account
- {email} / {password}, with the backup codes {code1} and {code2} for Google's sign-in check. It's a throwaway account with a YouTube channel and three playlists.
- Any Google account with a YouTube channel also works.

Try it (5 minutes)
1. On the first-run page, tick Auto-add, Playlist shortcuts and Queue button on thumbnails, then click Agree.
2. Sign in to youtube.com. In "Finish setting up", tick the playlist "Reviewer A".
3. In Settings › YouTube › Auto-add, set the required percentage to 0 %, then open any video. The message Auto-added “…” to Reviewer A appears.
4. Press Alt+W. The message Saved “…” to Watch later appears, with Undo. Alt+U undoes the save while that message is on screen.
5. On the home page, hover a thumbnail. The queue button adds the video to the queue.
6. On music.youtube.com, switch on Quick actions (Settings › YouTube Music) and hover a song to see Play next.

Without signing in, the queue button and YouTube Music's queue actions still work.
