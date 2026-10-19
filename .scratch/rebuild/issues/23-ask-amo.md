# Ask AMO whether 2.0 can declare no data collection

Type: task
Status: open
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
> 1. 2.0 makes no requests to any server of mine or any third party. Its only network requests go from a script in the user's YouTube tab to youtube.com itself, using the user's own signed-in session: adding a video to one of their playlists, or listing their playlists. Is `data_collection_permissions: { required: ["none"] }` correct for that, or does sending the video ID back to YouTube count as transmitting "website activity"?
> 2. 2.0 stores its settings with `storage.sync`: chosen playlist IDs, and channel IDs for per-playlist filters. Does Firefox Sync count as transmission under the data-collection rules, or is it treated as the browser's own feature?
> 3. The build uses Bun (`bun install --frozen-lockfile && bun run build`) instead of npm. Is that acceptable for the source-code submission if the README pins the Bun version and the build is reproducible? Is anything specific needed for the ARM64 review environment?
>
> Thanks!

**If the answer to 1 or 2 is "it counts":** declare `websiteActivity` (required or optional, as advised), raise `strict_min_version` to 140, and expect 1.4.5 users' updates to be held behind a consent prompt ([ticket 06](06-upgrade-path.md)).
