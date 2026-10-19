# How Add to queue works

[← Development](README.md)

The button fires the same command as YouTube's menu item (`addToPlaylistCommand` with `PLAYLIST_EDIT_LIST_TYPE_QUEUE`) from a page-world script, [`yt-queue-bridge.ts`](../../src/entrypoints/yt-queue-bridge.ts), because `resolveCommand` is not visible to content scripts.

- `openMiniplayer` / `onCreateListCommand` are only sent when no queue exists. Sending them otherwise replaces the queue.
- It uses `injectScript` instead of `world: "MAIN"` because the manifest supports Firefox 125 and MAIN world needs 128.
- Excluded pages are listed in `EXCLUDED_PATHS` in [`queue.ts`](../../src/lib/queue.ts).
