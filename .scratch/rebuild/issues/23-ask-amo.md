# Ask AMO whether 2.0 can declare no data collection

Type: task
Status: resolved
Labels: wayfinder:task
Part of: [Rebuild (2.0)](../map.md)

## Question

AMO's definition of data "transmission" doesn't clearly exempt requests sent only to the site the user is on ([ticket 03](03-store-policy.md)). Ask AMO's reviewers, through the add-on's developer hub or the add-ons Matrix room, three things:
- Does `data_collection_permissions: none` cover an add-on whose only network requests go to YouTube, through the user's own session?
- Does settings sync through `storage.sync` count as transmission?
- Do reviewers accept a Bun build for source-code submission?

The agent drafts the message; the user sends it. Record the replies, including the fallback if the answer is no: declaring `websiteActivity`, with a Firefox 140+ minimum.

## Draft message

Status: drafted on 2026-10-19 and waiting for the user to send it. Post it in Mozilla Discourse's Add-ons category (discourse.mozilla.org/c/add-ons/35) or the `#addons:mozilla.org` Matrix room, signed in as the add-on's owner.

> **Subject:** `data_collection_permissions` for an add-on that only talks to the site the user is on
>
> Hi! I maintain YouTube Playlist Tools (`{cc70cd21-2cc6-444b-bd89-496909346091}`, addons.mozilla.org/firefox/addon/youtube-playlist-tools). Version 2.0 is a rewrite, and I'd like to declare data collection correctly before submitting it:
>
> 1. 2.0 makes no requests to any server of mine or any third party. Its only network requests go from a script in the user's YouTube tab to youtube.com itself, using the user's own signed-in session: listing their playlists, or adding a video to one of them. Where YouTube's own page code can't send a request, the script signs it the same way YouTube's code does, from the session cookie in that tab, and sends it only to YouTube. Is `data_collection_permissions: { required: ["none"] }` correct for that?
> 2. 2.0 has an opt-in settings sync through `storage.sync` (off by default). It syncs a hash of the YouTube account ID, the account's display name, @handle and avatar URL, playlist IDs, and channel IDs and names used in per-playlist filters. Does Firefox Sync count as transmission here? If it does, which data type applies, and is it acceptable to declare it as an *optional* type requested from the click that switches sync on?
> 3. In a private window, 2.0 never stores anything about the session, but it does save settings the user changes there, such as switching a feature on. Is that acceptable?
> 4. Dependencies are installed with Bun (`npx --yes bun@1.4.3 install --frozen-lockfile`, from `bun.lock`); the build itself runs on Node 24 (`npm run build:firefox`), and CI rebuilds the sources zip that way on ARM64 and x86-64 and checks the output is identical. Is a Bun-installed dependency tree acceptable for the source-code submission, or do you need an npm lockfile (`npm ci`)?
>
> Thanks!

**If the answer to 1 or 2 is "it counts":** declare `websiteActivity` (required or optional, as advised), raise `strict_min_version` to 140, and expect 1.4.5 users' updates to be held behind a consent prompt ([ticket 06](06-upgrade-path.md)).

Also from [ticket 11](11-accounts.md): consider adding a question on whether saving the user's own shared-settings changes made in a private window is acceptable.

Also from [ticket 10](10-youtube-access.md): add a fourth question. Does signing requests in the page from the session cookie, sent only to YouTube, change `none`? With a Firefox floor of 140, the `websiteActivity` fallback costs nothing extra.

Also from [ticket 16](16-storage-and-sync.md): question 2 should list exactly what syncs: account digests, names, handles and avatar URLs, playlist and channel IDs, and channel names. Also ask which data type applies, and whether an *optional* type requested from the click that switches sync on is acceptable.

Also from [ticket 19](19-upgrade-and-rollout.md): record the reply against the table in its Answer, which gives the manifest, upgrade and copy change for each reply to each question. If AMO refuses Bun, only the install step falls back to npm, adding a second lockfile.

Corrected on 2026-10-19 (spec chapter 08): question 4 now describes the real build: a Bun install, then a Node build.

## Answer

**Resolved by decision on 2026-10-19, without sending the message.** The user pointed to Mozilla's KB article on permission request messages, which, together with Mozilla's other docs and Firefox's source, answers enough. The full reasoning and sources are in [R83](../spec/resolutions.md#after-the-spec-firefox-prompts-and-data-collection-r83).
- **Q1 (`none` for requests only to YouTube):** yes. 2.0 declares `required: ["none"]`. Firefox frames data collection as data shared with the extension developer, and 2.0 shares nothing with its developer or any third party. Residual risk: AMO's broad transmission definition, and cookie access counting as personal data, applied to the page-signed route. This is mitigated by R48, R49 and chapter 08 §13's fallback.
- **Q2 (settings sync):** not data collection. It's the browser's own sync, and the developer never sees it. No data type is declared.
- **Q3 (settings changed in a private window):** allowed. These aren't browsing data.
- **Q4 (Bun install):** as planned, with the npm-lockfile fallback.

The drafted message above stays available if the user ever wants AMO's written confirmation.
