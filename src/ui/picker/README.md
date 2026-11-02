# Extension-page playlist picker

`PickerPanel` renders the accepted `PickerModel` in save, choose, or many mode. `PlaylistChooser` anchors that panel to a controlled button on settings or the first-run page. Both use the existing shared localization wrapper, accepted controls, and Perchling tokens.

## Ownership and lifecycle

`PickerPanel` receives a model, `PickerText`, a header purpose, and the platform for live shortcut labels. The caller owns the injected model. `onoutcome` receives the exact model answer. `onpending` exposes the corresponding outcome promise before it settles. Neither callback is a storage receipt.

`PlaylistChooser` receives `open`, an account-scoped `ChooserContext`, the actual current title, a source factory, and an availability fact. A user gesture calls `onrequest`. The caller changes `open`. The chooser renders only its button until it first opens. Then it imports `ChooserPopover`, which holds the popover, the sessions and the panel, so the picker and Bits UI load on first open (G43). Each open creates a new choose-mode `PickerModel`. An account, purpose, privacy, or source-factory change releases the prior session and creates another one.

`onrelease` is required. It receives the model, context, reason, and outstanding `Promise<PickerEvent>` values. The caller owns disposal timing and calls `picker.close()` under its eventual policy. The renderer detaches the prior panel and suppresses stale UI callbacks. It never reuses a released model.

The three first-pick policies were settled on 2026-11-01 (R171 to R173). A picked outcome never closes this container. The caller closes it when the choice is `ok` or skipped. A private first pick's row shows "Saved. Private windows don't keep your playlist choice." (R171). A refused choice after a confirmed save shows the save, the refusal, **Undo** and **Try again** on the row, and Try again retries only the choice (R172). A first pick under way finishes after release, in the model, so the release callback may close the model at once (R173). The renderer still provides no first-pick toast.

The synthetic fixture closes models immediately in its own release handler. That handler is fixture behavior, not a production policy.

## Displayed state

Rows keep the model's order. Membership reads do not disable cached rows. A row that is busy retains focus, ignores repeated activation, and shows its last settled check until the answer arrives. Missing titles and counts remain unavailable. Counts use `Intl.PluralRules` through `I18n`; saved timestamps use its `Intl.DateTimeFormat` wrapper.

The inline form uses `picker.form`, `titleCheck`, `creation`, and `creating`. A creation failure preserves typed text. Duplicate titles are hints. Undo callbacks remain with the owner and never delete a playlist. Pins and marks are sibling controls, so a row contains no nested button.

The panel contains Escape, supports row navigation, and focuses search with `preventScroll`. Bits UI owns the checkbox and popover behavior. The chooser uses a portal, collision handling, and available-height constraints. The caller supplies the actual disabled explanation. Private gather uses the settled exact explanation.

## Adjoining integration

This unit adds no Backend, storage owner, account discovery, playlist service RPC, or live source binding. The first-run owner still commits its scalar choice after the chooser returns. A later integration must establish one commit owner before connecting this renderer.

Many mode uses the actual model whose source has `item: null`. Full AutoAddList filters, percentages, options, popup sheets, and site popovers remain separate.

The accepted model has no initial-list failure field and does not report the visibility preference write started after creation. The renderer shows conservative unavailable data and reports observable explicit outcomes. It does not fabricate an initial failure, freshness, or preference persistence result. Any richer model outcome needs a separate unapplied change.

## Verification state

The authoring lease allows static source work only. Compiler, tests, consumer runs, builds, browser rendering, visual parity, and axe are unexecuted. The authored commands and fixtures live in `tools/fixtures/picker-ui/README.md`. No review was requested.
