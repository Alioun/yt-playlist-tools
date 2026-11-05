# Thumbnail Add to queue button

`queueButton` is the FeatureHost definition for the `queue-button` feature on YouTube (YT-Q-01 to YT-Q-10, UI-YT-07 to UI-YT-13 and UI-YT-15). It is authored source. Compilers, tests, rendering, axe and live-site compatibility are unexecuted.

## Lifetime

Construction and definition are inert. `start` runs only while the current qualified TabView enables `queue-button`. It leases the overlay's `queue` slot, tracks Items (which shares the one Pointer lease), and registers one delegated `pointerover`, `focusin`, `pointerout` and `fullscreenchange` listener on the document. Everything belongs to the FeatureHost Scope. Turning the feature off, a null view after account change or orphaning, or host disposal releases all of it. The next enable starts a fresh lifetime with empty item state. SiteCore assembly supplies the services and is adjoining work. No entrypoint is activated here.

## Services

`QueueButtonServices` names only real collaborators. `items` is `WwwItems`. `page` is the PageLink `run`, `watch` and `onState`. `feedback` is a FeedbackSession, so toasts use the existing toaster, the core Undo key and its hidden and fullscreen policy. `overlay` is the shared overlay kit. `text` is `queueButtonText` from `shared/copy`. `notices.wouldAct` is a required collaborator. The core binds it to the YT-BRK-02 notice policy (once per session, 60 ms batching, first visible tab). The callback is not a Monitor receipt.

## Item state

`model.ts` holds the five states as a discriminated union. A state belongs to the video within the page view, so two cards with one video share Added and a recycled renderer shows its new video's state. Navigation, a PageLink state change or a fresh lifetime resets the view. Each render re-recognises the shown card with Items' own `recogniseWwwItem` and conceals the overlay when identity changed.

| State | Glyph | Click |
| --- | --- | --- |
| Idle | queue | Adds |
| Busy | spinner | Ignored |
| Added | check | Ignored until navigation or a successful Undo |
| Unconfirmed | dots in a circle | Sends again, only on that click |
| Failed | error, 1.5 s, then Idle | Ignored |

## Answers

`queueAdd` targets the recognised card and carries no account pin, so signed-out tabs and missing account keys still add. Filters, skips, membership and AddFlow are never consulted. Only `confirmed: true` renders Added. `confirmed: false` and the PageLink deadline both render Unconfirmed. Other failures render Failed. A noisy confirmed add stands without our toast; the gateway records `quiet-route-noisy`. Confirmed quiet success shows "Added “{title}” to queue" when Show feedback is on, with Undo only when the gateway returned the exact `{listId, setVideoId}`. Unconfirmed and failed toasts show regardless of Show feedback. Undo calls `queueUndo` with the captured entry, closes the toast and returns that video to Idle on success, and reads "Couldn't undo." otherwise. A result after disposal changes nothing. A result after navigation still answers with its toast but leaves the new page view's state alone.

## Placement

The overlay host sits right after the card's thumbnail link, 4 px into its offset box, and moves into search's inline preview while that preview covers the thumbnail. The slot is not drawn where the card contains YouTube's own `[aria-label='Add to queue']`. Placement re-checks at 150 ms and 900 ms after each hover, and the preview is observed only while it holds the host. Moving to another card cancels the old checks. The button never takes focus, uses `aria-disabled` rather than `disabled` to keep the tab order, and the host stops only its own click events from reaching the card.

## Not proven

The queue glyph path, colours, sizes and tooltip styling are unmeasured against the live site. `[aria-label='Add to queue']` is the spec's English label, so suppression of YouTube's own button is unproven in other locales. The gateway, PageLink, Pointer and Items remain unqualified after evidence loss.
