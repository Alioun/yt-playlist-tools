# Gather

`gather.ts` is the background Gather module's manual half (02 §2.16, ARC-MOD-40): one window, three destinations, closing and playlist Undo.

- It reads a window through `GatherNativePort` (`tabs/ports.ts`): address, title, place and access time. It never messages, injects into, activates, reloads or wakes a gathered tab.
- Selection is `shared/rules/gather.ts`: `videoOf`, `languageTitle` and `order`. Language groups come from the `language` port, which the composition binds to `i18n.detectLanguage`.
- YouTube's player and queue are confirmed by the destination itself: the new tab's address naming a list, and `queueAddList` answering `confirmed` with every submitted ID. A create callback, a load or a delivered call is not confirmation.
- A gather into the gather playlist is one `AddFlow.batch`. Its Undo record, with the closed tabs and the Recent entry, is one `gather` session edit, planned inside the batch before any tab closes. Private gathers stay in AddFlow's memory.
- Undo is `AddFlow.undo`. Only a complete removal returns `reopen`, and only then do tabs reopen in the background.

- DATA-58's record is the store's `gather` session record, through the canonical owner: `last` (at most five, of three kinds: a playlist Undo record, a reopen-only record when every video was already in, and a player or queue record), `paced`, `kept` and `refused`. A private window's gathers stay in AddFlow's and this module's memory.
- Closing is a plan until the browser shows each tab gone. The record names the planned tabs (`closing`, with their tab IDs); each is read again right before the one `tabs.remove` call and after it, and `AddFlow.settle` replaces the plan with the tabs read back as gone (`closed`). A tab still open, navigated or unreadable is never counted, and no removal is retried. Undo reopens `closed` only.
- Reopened tab IDs go to the session's `kept`. `activated(tabId, scope)` is the seam that takes a tab out of it once the user switches to it; no trigger calls it yet.
- `execution.ts` is AddFlow's execution port over the Tabs engine: a popup origin goes through `Tabs.serve` with the account in view, a tab origin through `Tabs.runIn`. `browser.ts` adapts the browser's tabs and windows, with Firefox's unloaded reopen and its loaded fallback.

Not here yet: the automatic triggers (YT-GT-22 to YT-GT-29), the `ui.gather*` routes and the composition. `.audit/gather-controller-authoring/` and `.audit/gather-manual-completion/` name each.
