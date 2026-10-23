# How Add to queue works

[← Development](README.md)

After consent, the content script sends a queue request to the extension background. The background validates the sender and video ID, then injects `queueInPage` from [`session.ts`](../../src/lib/session.ts) into that tab's MAIN world. No event bridge remains on the page.

The page function fires YouTube's `addToPlaylistCommand` with `PLAYLIST_EDIT_LIST_TYPE_QUEUE`. It sends `openMiniplayer` and `onCreateListCommand` only when no queue exists, because those fields replace an existing queue.

Excluded pages are listed in `EXCLUDED_PATHS` in [`queue.ts`](../../src/lib/queue.ts). Revoking consent removes the extension's queue controls and blocks further queue requests.
