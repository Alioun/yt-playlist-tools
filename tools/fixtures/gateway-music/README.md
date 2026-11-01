# Gateway Music fixture

One composed JSONL consumer for the YouTube Music page jobs `queueInsert`, `queueRemoveIds`, `queueMove`, `queueRemove`, `queueReinsert`, `like`, `library` and `navigate`. It drives the real `createGateway`, app-state lane, account guard, Music route table, `servePage`, the direct and DOM page channels and `createPageLink`. The only fake is the `MusicPagePort` native boundary in `src/page/music-gateway.specimens.ts`, plus `scriptedPage` for config and page reads.

`run.ts direct` and `run.ts dom` must both print `expected-output.jsonl` byte for byte. The behaviour tests for the same jobs are `src/page/music-gateway.bun-test.ts`, and the live adapter's tests are `src/page/adapters/live-music.bun-test.ts`.

## Where the shapes come from

Nothing here is a capture from a live page. The fake port follows these sources, all in local git history:

- `git show c6e9c202f:docs/research/youtube-music.md`, sections 2.1 to 2.7, for the menu item's `queueAddEndpoint`, the `music/get_queue` answer, `app.queue.removeItem`, `likeEndpoint`, the library toggle and the navigation endpoints.
- `git show e5ec1fc65:docs/research/queue-reorder.md`, sections 3.1 and 3.3, for the reorder drop and its checks.
- `git show 53833ffb3:probes/live-checks/page-main.js`, the ticket 25 probe's `ytm` helpers, `queueAddReplay`, `menuItemBehaviour` and `moveTo`.

## Unverified until the owner's live checks

- M1 must confirm that the menu-item route and queue replay insert while signed in, and what `music/get_queue` returns signed in.
- M3 must confirm that `handleServiceEndpoint` writes the like to `likeStatus.videos`, what the library toggle's signed-in endpoints are, and whether either action shows YouTube Music's toast.
- M5 must confirm that `castStatus` is a boolean at the root of the app store.
- T28.1 to T28.7 must confirm that the reorder drop moves the entry at once and that `panel.data` stays the store's `queue.items` array.
- No check yet covers how YouTube Music raises its own toast. The live port listens for `yt-action` events named `yt-add-to-toast-action` or `yt-open-popup-action`.

When a live check disagrees, change the parser in `src/page/parsers/music-queue.ts`, the port in `src/page/adapters/live-music.ts` or the route table in `src/page/routes/music.ts`. Then update the specimens and regenerate `expected-output.jsonl`.
